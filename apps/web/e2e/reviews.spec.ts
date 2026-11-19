import { endpoints } from '@heremita/shared';
import type { Account } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { toasts } from './support/planner';

/** The id of a seeded place, as the place search reports it. */
async function seededPlaceId(account: Account, name: string): Promise<string> {
  const { items } = await account.api.call(endpoints.searchPlaces, {
    query: { q: name, locale: 'en' },
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
  await page.goto(`/en/places/${placeId}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Sainte-Chapelle' })).toBeVisible();
  await expect(page.getByText(/^\d reviews?$/)).toBeVisible();
  await expect(page.getByText(/^Average /)).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Write a review' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Review Sainte-Chapelle' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: '5 stars' }).check();
  await page.getByLabel('When did you go?').fill(lastMonth());
  await page
    .getByRole('textbox', { name: 'Your opinion' })
    .fill('Stunning stained glass on a sunny morning.');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Publish' }).click();

  await expect(page).toHaveURL(new RegExp(`/en/places/${placeId}$`));
  await expect(toasts(page).getByText('Review published')).toBeVisible();
  const mine = page.getByRole('article').first();
  await expect(mine).toContainText('Stunning stained glass on a sunny morning.');
  await expect(mine).toContainText('Your review');
  await expect(page.getByText(/^[2-5] reviews$/)).toBeVisible();
  await expect(page.getByText(/^Average /)).toHaveCount(0);

  await page.getByRole('button', { name: 'Actions for the review by Elena Hart-Test' }).click();
  await page.getByRole('button', { name: 'Report' }).click();
  const report = page.getByRole('dialog', { name: 'Report this review' });
  await report.getByRole('radio', { name: 'Spam or advertising' }).check();
  await expectAccessible(page);
  await report.getByRole('button', { name: 'Send report' }).click();

  await expect(toasts(page).getByText('Report sent. A moderator will look at it.')).toBeVisible();
  await expect(report).toBeHidden();
});
