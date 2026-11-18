import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:3100';
const API_HEALTH_URL = 'http://localhost:3101/api/v1/health';
const repoRoot = path.join(import.meta.dirname, '../..');
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // Mobile first: a phone-sized, touch-enabled Chromium.
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // Playwright starts the API and the web app itself, or reuses the ones that
  // `pnpm dev` already started. On CI it always runs the production builds.
  webServer: [
    {
      name: 'api',
      command: isCI
        ? 'pnpm --filter @heremita/api run build && pnpm --filter @heremita/api run start'
        : 'pnpm --filter @heremita/api run dev',
      cwd: repoRoot,
      url: API_HEALTH_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      name: 'web',
      command: isCI
        ? 'pnpm --filter @heremita/web run build && pnpm --filter @heremita/web run start'
        : 'pnpm --filter @heremita/web run dev',
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
});
