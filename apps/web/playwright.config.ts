import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  apiEnvironment,
  E2E_API_ORIGIN,
  E2E_WEB_ORIGIN,
  E2E_WEB_PORT,
  webEnvironment,
} from './e2e/support/environment';

const webDir = import.meta.dirname;
const apiDir = path.join(webDir, '../api');
const isCI = Boolean(process.env.CI);

/**
 * Hermetic e2e (§I.test, V72): production builds of the API and the web app on
 * their own ports (3110/3111) against a freshly recreated `heremita_e2e`
 * database, fake providers and a blank map style. Never reuses running servers.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  // A flaky test is a bug: quarantine it with an owner, never retry it to green.
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_WEB_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    // Mobile first: a phone-sized, touch-enabled Chromium.
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // Non-blocking until headless WebKit WebGL2 is confirmed: `pnpm e2e` leaves
    // it out, `pnpm e2e:webkit` runs it.
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: [
    {
      name: 'api',
      // The database is prepared here, not in globalSetup: Playwright starts the
      // web servers first, and the API must boot on the migrated database.
      command: [
        `node ${path.join(webDir, 'e2e/support/prepare-database.ts')}`,
        // Own output directory: `nest build` would wipe the dist/ that `pnpm dev` serves.
        'pnpm exec tsc -p tsconfig.build.json --outDir dist-e2e',
        'node --enable-source-maps dist-e2e/main.js',
      ].join(' && '),
      cwd: apiDir,
      url: `${E2E_API_ORIGIN}/api/v1/health/ready`,
      env: apiEnvironment,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      name: 'web',
      command: `pnpm exec next build && pnpm exec next start --port ${E2E_WEB_PORT}`,
      cwd: webDir,
      url: `${E2E_WEB_ORIGIN}/dev/blank-style.json`,
      env: webEnvironment,
      reuseExistingServer: false,
      timeout: 360_000,
    },
  ],
});
