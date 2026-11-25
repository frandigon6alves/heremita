import { expect, expectAccessible, test, uniqueEmail } from './support/fixtures';
import { accountActions, siteNav } from './support/ui';

test.use({ locale: 'pt-BR' });

test('signs_up_in_portuguese_keeps_the_session_on_reload_and_logs_out', async ({
  page,
}, testInfo) => {
  const displayName = 'Beatriz Viajante';

  await page.goto('/');
  await expect(page).toHaveURL(/\/pt-BR$/);
  await (await siteNav(page)).getByRole('link', { name: 'Criar conta', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('textbox', { name: 'Nome' }).fill(displayName);
  await page
    .getByRole('textbox', { name: 'E-mail' })
    .fill(uniqueEmail('journey', testInfo.workerIndex));
  await page.getByLabel('Senha', { exact: true }).fill('uma senha bem longa');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  // The app bar names the new viewer: the POST went through the web origin's rewrite (V30).
  const signedInAs = async () =>
    (await siteNav(page)).getByText(displayName, { exact: true }).first();
  await expect(await signedInAs()).toBeVisible();
  await page.keyboard.press('Escape');
  await expectAccessible(page);

  await page.reload();
  await expect(await signedInAs()).toBeVisible();
  await page.keyboard.press('Escape');

  await (await accountActions(page)).getByRole('button', { name: 'Sair' }).click();

  await expect(page).toHaveURL(/\/pt-BR$/);
  await expect(
    (await siteNav(page)).getByRole('link', { name: 'Entrar', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(displayName, { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(
    (await siteNav(page)).getByRole('link', { name: 'Entrar', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(displayName, { exact: true })).toHaveCount(0);
});
