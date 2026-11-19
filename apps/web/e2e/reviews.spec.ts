import { endpoints } from '@heremita/shared';
import type { Account } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { toasts } from './support/planner';

test.use({ locale: 'pt-BR' });

/** The id of a seeded place, as the place search reports it. */
async function seededPlaceId(account: Account, name: string): Promise<string> {
  const { items } = await account.api.call(endpoints.searchPlaces, {
    query: { q: name, locale: 'pt-BR' },
  });
  const placeId = items.find((item) => item.name === name)?.placeId;
  if (!placeId) {
    throw new Error(`${name} is not a seeded place`);
  }
  return placeId;
}

/** Last month, `YYYY-MM` (UTC): never in the future. */
function lastMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
}

test('reviews_a_seeded_place_without_an_average_and_reports_another_review', async ({
  page,
  account,
}) => {
  // Seeded with one review (by Elena); a handful more stay below the 6 an average needs.
  const placeId = await seededPlaceId(account, 'Sainte-Chapelle');
  await page.goto(`/pt-BR/places/${placeId}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Sainte-Chapelle' })).toBeVisible();
  await expect(page.getByText(/^\d avaliaç(ão|ões)$/)).toBeVisible();
  await expect(page.getByText(/^Média /)).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Escrever avaliação' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Avaliar Sainte-Chapelle' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: '5 estrelas' }).check();
  await page.getByLabel('Quando você foi?').fill(lastMonth());
  await page
    .getByRole('textbox', { name: 'Sua opinião' })
    .fill('Vitrais incríveis numa manhã de sol.');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Publicar' }).click();

  await expect(page).toHaveURL(new RegExp(`/pt-BR/places/${placeId}$`));
  await expect(toasts(page).getByText('Avaliação publicada')).toBeVisible();
  const mine = page.getByRole('article').first();
  await expect(mine).toContainText('Vitrais incríveis numa manhã de sol.');
  await expect(mine).toContainText('Sua avaliação');
  await expect(page.getByText(/^[2-5] avaliações$/)).toBeVisible();
  await expect(page.getByText(/^Média /)).toHaveCount(0);

  await page.getByRole('button', { name: 'Ações da avaliação de Elena Hart-Test' }).click();
  await page.getByRole('button', { name: 'Denunciar' }).click();
  const report = page.getByRole('dialog', { name: 'Denunciar esta avaliação' });
  await report.getByRole('radio', { name: 'Spam ou propaganda' }).check();
  await expectAccessible(page);
  await report.getByRole('button', { name: 'Enviar denúncia' }).click();

  await expect(toasts(page).getByText('Denúncia enviada. A moderação vai analisar.')).toBeVisible();
  await expect(report).toBeHidden();
});
