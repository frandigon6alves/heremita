/**
 * Recreates the e2e database: drop + create (never `prisma migrate reset`),
 * apply the migrations, seed the demo data. Run by the API web server command
 * before the API boots, because Playwright starts web servers before
 * `globalSetup`. Plain Node (type stripping): `node e2e/support/prepare-database.ts`.
 */
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? '';
const target = new URL(databaseUrl);
const databaseName = target.pathname.slice(1);
if (!/^[a-z0-9_]+_e2e$/.test(databaseName)) {
  throw new Error(
    `Refusing to recreate "${databaseName}": the e2e database name must end in _e2e.`,
  );
}

const maintenance = new URL(target);
maintenance.pathname = '/postgres';
const client = new pg.Client({ connectionString: maintenance.href });
await client.connect();
try {
  await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${databaseName}"`);
} finally {
  await client.end();
}

// The seed refuses NODE_ENV=production, which the API build under test runs with.
const toolEnv = { ...process.env, NODE_ENV: 'test' as const, DATABASE_URL: databaseUrl };
for (const script of ['db:deploy', 'db:seed']) {
  execFileSync('pnpm', ['--filter', '@heremita/api', 'run', script], {
    env: toolEnv,
    stdio: 'inherit',
  });
}
