import { expect, expectAccessible, test, uniqueEmail } from './support/fixtures';

test.use({ locale: 'pt-BR' });

test('signs_up_in_portuguese_keeps_the_session_on_reload_and_logs_out', async ({
  page,
}, testInfo) => {
  const displayName = 'Beatriz Viajante';

  await page.goto('/');
  await expect(page).toHaveURL(/\/pt-BR$/);
  await page.getByRole('link', { name: 'Criar conta', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('textbox', { name: 'Nome' }).fill(displayName);
  await page
    .getByRole('textbox', { name: 'E-mail' })
    .fill(uniqueEmail('journey', testInfo.workerIndex));
  await page.getByLabel('Senha', { exact: true }).fill('uma senha bem longa');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  // The app bar names the new viewer: the POST went through the web origin's rewrite (V30).
  const accountMenu = page.getByRole('button', { name: `Conta: ${displayName}` });
  await expect(accountMenu).toBeVisible();
  await expectAccessible(page);

  await page.reload();
  await expect(accountMenu).toBeVisible();

  await accountMenu.click();
  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page).toHaveURL(/\/pt-BR$/);
  const logIn = page.getByRole('link', { name: 'Entrar', exact: true });
  await expect(logIn).toBeVisible();
  await expect(accountMenu).toHaveCount(0);

  await page.reload();
  await expect(logIn).toBeVisible();
  await expect(accountMenu).toHaveCount(0);
});
