import { endpoints } from '@heremita/shared';
import { arrangeTrip, PLACES } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { openPlanner, openRowMenu } from './support/planner';

test('offline_pauses_edits_with_a_banner_and_online_brings_them_back', async ({
  page,
  context,
  account,
}) => {
  const trip = await arrangeTrip(account.api, {
    title: 'No signal',
    days: [[PLACES.torreDeBelem, PLACES.mosteiroDosJeronimos]],
  });
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}`);
  const addHere = page.getByRole('button', { name: 'Add here' });
  const rowMenu = page.getByRole('button', { name: 'Actions for Torre de Belém' });
  await expect(addHere).toBeEnabled();

  await context.setOffline(true);

  const banner = page
    .getByRole('paragraph')
    .filter({ hasText: 'You are offline. Changes are paused.' });
  await expect(banner).toBeVisible();
  await expect(addHere).toBeDisabled();
  await expect(rowMenu).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add a day' })).toBeDisabled();
  await expectAccessible(page);

  await context.setOffline(false);

  await expect(banner).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'You are back online.' })).toBeAttached();
  await expect(addHere).toBeEnabled();
  const menu = await openRowMenu(page, 'Torre de Belém');
  await expect(menu.getByRole('button', { name: 'Move down' })).toBeEnabled();
});

const IMG = '<img src=x onerror=alert(1)>';
const SCRIPT = '</script><script>alert(1)</script>';

test('user_text_with_markup_renders_literally_and_runs_nothing', async ({ page, account }) => {
  page.on('dialog', (dialog) => {
    throw new Error(`Untrusted text ran script: dialog "${dialog.message()}"`);
  });
  const trip = await arrangeTrip(account.api, { title: IMG, days: [[PLACES.lxFactory]] });
  const tripPlaceId = trip.plan.places[0]?.id ?? '';
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}&place=${tripPlaceId}`);

  await expect(page.getByRole('heading', { level: 1, name: IMG })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your note' }).fill(IMG);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Your note' })).toHaveValue(IMG);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);

  const placeId = trip.plan.places[0]?.place.id ?? '';
  await account.api.call(endpoints.putMyReview, {
    params: { placeId },
    body: { rating: 4, visitedMonth: '2026-01', body: SCRIPT },
  });
  await page.goto(`/en/places/${placeId}`);
  const mine = page.getByRole('article').filter({ hasText: 'Your review' });
  await expect(mine).toContainText(SCRIPT);
  await expectAccessible(page);
});
