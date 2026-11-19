import { endpoints } from '@heremita/shared';
import { expect, signedInTest, test } from './support/fixtures';

test('rejects_a_cross_site_login_through_the_web_origin', async ({ request }) => {
  const response = await request.post(`/api/v1${endpoints.logIn.path}`, {
    headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://attacker.example' },
    data: { email: 'nobody@e2e.example.com', password: 'a long passphrase' },
  });

  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'csrf_rejected' });
});

signedInTest('opens_signed_in_as_the_worker_account', async ({ page, workerAccount }) => {
  await page.goto('/pt-BR');

  await expect(
    page.getByRole('button', { name: `Conta: ${workerAccount.me.displayName}` }),
  ).toBeVisible();
});
