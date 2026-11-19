import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { toasts } from './support/planner';
import { checkOnceHydrated } from './support/ui';

test('switches_english_to_spanish_to_portuguese_and_keeps_the_dark_theme', async ({ page }) => {
  await page.goto('/en/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expectAccessible(page);

  await expect(
    page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Preferences' }),
  ).toHaveAttribute('href', '#preferences');
  await checkOnceHydrated(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }),
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Saving the language loads the page again under the new prefix.
  await page
    .getByRole('group', { name: 'Language' })
    .getByRole('radio', { name: 'Español' })
    .click();
  await expect(page).toHaveURL(/\/es\/settings#preferences$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(
    page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: 'Oscuro' }),
  ).toBeChecked();
  await expectAccessible(page);

  await page
    .getByRole('group', { name: 'Idioma' })
    .getByRole('radio', { name: 'Português (Brasil)' })
    .click();
  await expect(page).toHaveURL(/\/pt-BR\/settings#preferences$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: 'Escuro' }),
  ).toBeChecked();
  await expectAccessible(page);

  // The theme comes from the server render, not from a script after paint (V67).
  const html = await (await page.request.get('/pt-BR/trips')).text();
  expect(html).toMatch(/<html[^>]* data-theme="dark"/);
});

test('deletes_the_account_and_its_login_stops_working', async ({ page, account }) => {
  await page.goto('/en/settings');
  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);
  await confirm.getByLabel('Password', { exact: true }).fill(account.password);
  await confirm.getByRole('button', { name: 'Delete account' }).click();

  await expect(page).toHaveURL(/\/en$/);
  await expect(toasts(page).getByText('Your account was deleted.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();

  await page.goto('/en/login');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'E-mail or password is wrong.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/en\/login$/);
});
