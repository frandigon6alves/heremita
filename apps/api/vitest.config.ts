import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Same rule as `node --env-file-if-exists`: variables already set in the environment win.
const envFile = path.join(import.meta.dirname, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  test: {
    // Tests never reach a real map provider, whatever apps/api/.env says.
    env: {
      GEOCODING_PROVIDER: 'fake',
      ROUTING_PROVIDER: 'fake',
      NOMINATIM_ENABLED: 'false',
      AI_PROVIDER: 'fake',
    },
    // ...and no request leaves the machine, whatever the code under test does.
    setupFiles: ['test/support/network-lockdown.ts'],
    // Every integration file boots the app against its own database on the one
    // local PostgreSQL. At the default worker count (cores - 1) the workers and
    // PostgreSQL compete for the same cores, and the heaviest plan tests (about
    // 1.5 s alone) pass the 5 s test timeout even on an otherwise idle machine.
    // The root `pnpm test` also runs the packages one at a time for the same reason.
    maxWorkers: 2,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts', 'evals/**/*.test.ts'] },
      },
      {
        // Needs PostgreSQL (`pnpm db:up`). Each file gets its own database.
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          globalSetup: ['test/support/global-setup.ts'],
        },
      },
    ],
  },
});
