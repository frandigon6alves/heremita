import { expect, test } from '@playwright/test';

test('the home page shows the map and a healthy API', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The API health is fetched by the browser through the Next.js rewrite.
  await expect(page.getByRole('status')).toHaveText('API: ok · database: up');

  // MapLibre labels its canvas as a region named "Map".
  await expect(page.getByRole('region', { name: 'Map' })).toBeVisible();

  // "ready" means that WebGL 2 works, the worker started, and the OpenFreeMap
  // style and its first tiles were downloaded and drawn.
  await expect(page.locator('[data-map-status]')).toHaveAttribute('data-map-status', 'ready', {
    timeout: 30_000,
  });
});
