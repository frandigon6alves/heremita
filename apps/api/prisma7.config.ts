import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env files by itself. Variables that are already
// set in the environment win over the file, as with `node --env-file`.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Read lazily: `prisma generate` must work without a database URL.
    url: process.env.DATABASE_URL,
  },
});
