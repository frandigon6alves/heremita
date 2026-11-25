import { endpoints } from '@heremita/shared';
import { expect, signedInTest, test } from './support/fixtures';
import { siteNav } from './support/ui';

test('rejects_a_cross_site_login_through_the_web_origin', async ({ request }) => {
  const response = await request.post(`/api/v1${endpoints.logIn.path}`, {
    headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://attacker.example' },
    data: { email: 'nobody@e2e.example.com', password: 'a long passphrase' },
  });

  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'csrf_rejected' });
});

signedInTest('opens_signed_in_as_the_worker_account', async ({ page, workerAccount }) => {
  await page.goto('/en');

  // The account button on wide screens, "Signed in as …" in the phone menu.
  await expect(
    (await siteNav(page)).getByText(workerAccount.me.displayName, { exact: true }).first(),
  ).toBeVisible();
});

test('shows_the_chosen_theme_icon_on_the_theme_button_from_the_first_paint', async ({ page }) => {
  await page.goto('/en');
  test.skip(
    await page.getByRole('banner').getByRole('button', { name: 'Menu', exact: true }).isVisible(),
    'phones carry the theme inside the gear menu',
  );
  const theme = page.getByRole('button', { name: 'Theme', exact: true });

  // A server component must render the icons (a client-module value is opaque there).
  await expect(theme.locator('svg:visible')).toHaveCount(1);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(theme.locator('[data-theme-icon="dark"]')).toBeVisible();
});
