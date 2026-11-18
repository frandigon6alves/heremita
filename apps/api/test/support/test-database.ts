import { randomBytes } from 'node:crypto';
import pg from 'pg';

/** A database that belongs to a single test file. */
export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

/**
 * The template database named by TEST_DATABASE_URL. The global setup drops and
 * recreates it, so the name must end in "_test" to keep the dev database safe.
 */
export function templateDatabaseUrl(): URL {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Run `pnpm env:init` or set it in the environment.',
    );
  }

  const url = new URL(value);
  const name = databaseName(url);
  if (!name.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in "_test", got "${name}".`);
  }
  return url;
}

export function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

function withDatabaseName(url: URL, name: string): URL {
  const copy = new URL(url);
  copy.pathname = `/${encodeURIComponent(name)}`;
  return copy;
}

/** Runs statements on the server's maintenance database, for CREATE and DROP DATABASE. */
export async function withMaintenanceClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = withDatabaseName(templateDatabaseUrl(), 'postgres');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates a private copy of the migrated template. Every test file that touches
 * the database calls this once, so files can run in parallel without seeing
 * each other's rows.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const template = templateDatabaseUrl();
  const name = `${databaseName(template)}_${randomBytes(6).toString('hex')}`;

  await withMaintenanceClient((client) =>
    client.query(
      `CREATE DATABASE ${client.escapeIdentifier(name)} TEMPLATE ${client.escapeIdentifier(databaseName(template))}`,
    ),
  );

  return {
    url: withDatabaseName(template, name).toString(),
    drop: async () => {
      await withMaintenanceClient((client) =>
        client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(name)} WITH (FORCE)`),
      );
    },
  };
}
