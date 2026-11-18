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
    env: { GEOCODING_PROVIDER: 'fake', ROUTING_PROVIDER: 'fake', NOMINATIM_ENABLED: 'false' },
    // ...and no request leaves the machine, whatever the code under test does.
    setupFiles: ['test/support/network-lockdown.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
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
