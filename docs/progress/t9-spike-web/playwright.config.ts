import { defineConfig, devices } from '@playwright/test';

const port = process.env.SPIKE_PORT ?? '3110';

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
