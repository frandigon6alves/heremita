import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { toasts } from './support/planner';
import { checkOnceHydrated } from './support/ui';

test.use({ locale: 'pt-BR' });

test('english_and_the_dark_theme_survive_a_reload', async ({ page }) => {
  await page.goto('/pt-BR/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
  await expectAccessible(page);

  await expect(
    page.getByRole('navigation', { name: 'Seções' }).getByRole('link', { name: 'Preferências' }),
  ).toHaveAttribute('href', '#preferences');
  await checkOnceHydrated(
    page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: 'Escuro' }),
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Saving the language loads the page again under /en: nothing to see checked here.
  await page.getByRole('group', { name: 'Idioma' }).getByRole('radio', { name: 'English' }).click();

  await expect(page).toHaveURL(/\/en\/settings#preferences$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }),
  ).toBeChecked();
  await expectAccessible(page);

  // The theme comes from the server render, not from a script after paint (V67).
  const html = await (await page.request.get('/en/trips')).text();
  expect(html).toMatch(/<html[^>]* data-theme="dark"/);
});

test('deletes_the_account_and_its_login_stops_working', async ({ page, account }) => {
  await page.goto('/pt-BR/settings');
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  const confirm = page.getByRole('dialog', { name: 'Excluir sua conta?' });
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await expectAccessible(page);
  await confirm.getByLabel('Senha', { exact: true }).fill(account.password);
  await confirm.getByRole('button', { name: 'Excluir conta' }).click();

  await expect(page).toHaveURL(/\/pt-BR$/);
  await expect(toasts(page).getByText('Sua conta foi excluída.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible();

  await page.goto('/pt-BR/login');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/pt-BR\/login$/);
});
