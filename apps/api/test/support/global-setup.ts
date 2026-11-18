import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { databaseName, templateDatabaseUrl, withMaintenanceClient } from './test-database.js';

const API_ROOT = path.join(import.meta.dirname, '../..');

/**
 * Runs once per `vitest` run, before the integration tests: rebuilds the
 * template database from the migrations and removes the copies that an
 * interrupted run left behind. Two test runs against the same server at the
 * same time are not supported.
 */
export default async function setup(): Promise<void> {
  const template = templateDatabaseUrl();
  const name = databaseName(template);

  await withMaintenanceClient(async (client) => {
    const copies = await client.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname LIKE $1',
      [`${name.replaceAll('_', '\\_')}\\_%`],
    );
    for (const { datname } of copies.rows) {
      await client.query(
        `DROP DATABASE IF EXISTS ${client.escapeIdentifier(datname)} WITH (FORCE)`,
      );
    }
    await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(name)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
  });

  try {
    execFileSync(path.join(API_ROOT, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: template.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout: string; stderr: string };
    throw new Error(`Migrating the test template database failed:\n${stdout}${stderr}`, {
      cause: error,
    });
  }
}
