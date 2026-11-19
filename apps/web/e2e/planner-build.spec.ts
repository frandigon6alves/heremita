import { accountTest, expect, expectAccessible, test, uniqueEmail } from './support/fixtures';
import { arrangeTrip, readPlan } from './support/api';
import { dayChip, expectMapReady, openPlanner, stopList, toasts } from './support/planner';

test('signs_up_creates_a_trip_and_lands_on_its_ideas', async ({ page }, testInfo) => {
  await page.goto('/en/signup');
  await page.getByRole('textbox', { name: 'Name' }).fill('Anna Planner');
  await page
    .getByRole('textbox', { name: 'E-mail' })
    .fill(uniqueEmail('journey1', testInfo.workerIndex));
  await page.getByLabel('Password', { exact: true }).fill('a nice long passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/en\/trips\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'New trip' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('textbox', { name: 'Title' }).fill('Lisbon in March');
  await page.getByRole('combobox', { name: 'Destination' }).fill('Praça do Com');
  await page.getByRole('option', { name: /Praça do Comércio/ }).click();
  await page.getByRole('spinbutton', { name: 'Number of days' }).fill('3');
  await page.getByRole('button', { name: 'Create and open' }).click();

  await expect(page).toHaveURL(/\/en\/trips\/[\w-]+\?day=ideas$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lisbon in March' })).toBeVisible();
  await expect(dayChip(page, 'Ideas')).toHaveAttribute('aria-pressed', 'true');
  await expect(dayChip(page, 'Day 3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No ideas yet' })).toBeVisible();
  await expectMapReady(page);
  await expectAccessible(page);
});

accountTest(
  'adds_a_search_result_to_day_1_undoes_it_and_adds_it_again',
  async ({ page, account }) => {
    const trip = await arrangeTrip(account.api, { title: 'Lisbon monasteries', days: [[]] });
    await openPlanner(page, trip.id, '?day=' + trip.plan.days[0]?.id);

    await page.getByRole('combobox', { name: 'Search places' }).fill('mosteiro');
    await page.getByRole('option', { name: /Mosteiro dos Jerónimos/ }).click();
    const add = page.getByRole('button', { name: 'Add to day 1' });
    await add.click();

    // The new stop opens its place card, on day 1.
    await expect(page.getByRole('button', { name: 'Day: Day 1' })).toBeVisible();
    await expect(page.getByText('Day 1 · 1 place')).toBeVisible();
    const added = toasts(page).getByRole('listitem').filter({
      hasText: 'Mosteiro dos Jerónimos added to day 1',
    });
    await expect(added).toBeVisible();
    await expectAccessible(page);
    await added.getByRole('button', { name: 'Undo' }).click();

    await expect(
      toasts(page).getByText('Mosteiro dos Jerónimos deleted from the trip'),
    ).toBeVisible();
    await expect(page.getByText('Day 1 · No places')).toBeVisible();
    await expect.poll(async () => (await readPlan(account.api, trip.id)).places).toEqual([]);

    // Typed key by key: the field must keep every key, also right after a pick.
    await page.getByRole('combobox', { name: 'Search places' }).pressSequentially('mosteiro dos');
    await page.getByRole('option', { name: /Mosteiro dos Jerónimos/ }).click();
    await page.getByRole('button', { name: 'Add to day 1' }).click();

    await expect(toasts(page).getByText('Mosteiro dos Jerónimos added to day 1')).toBeVisible();
    await page.getByRole('button', { name: 'Back to the list' }).click();
    await expect(stopList(page, 1).getByRole('listitem')).toHaveText([/Mosteiro dos Jerónimos/]);
    await expect
      .poll(async () => (await readPlan(account.api, trip.id)).days[0]?.stops.length)
      .toBe(1);
  },
);
