import { arrangeTrip, PLACES } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { openPlanner } from './support/planner';

test('switching_to_bike_changes_the_legs_and_a_routing_outage_falls_back_to_estimates', async ({
  page,
  account,
}) => {
  const trip = await arrangeTrip(account.api, {
    title: 'Cycling around Belém',
    days: [[PLACES.torreDeBelem, PLACES.mosteiroDosJeronimos, PLACES.lxFactory]],
  });
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}`);

  const firstLeg = page.getByRole('button', { name: /^Route to Mosteiro dos Jerónimos/ });
  await expect(firstLeg).toHaveAccessibleName(/on foot: \d+ min · [\d.]+ km$/);
  const walking = await firstLeg.textContent();

  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('radio', { name: 'Bike' })
    .check();

  await expect(page).toHaveURL(/[?&]mode=bike/);
  await expect(firstLeg).toHaveAccessibleName(/by bike: \d+ min · [\d.]+ km$/);
  await expect(firstLeg).not.toHaveText(walking ?? '');
  await expectAccessible(page);

  // The routing provider goes down: the day keeps its stops, with straight-line estimates.
  await page.route('**/api/v1/trips/*/days/*/route**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/problem+json',
      json: {
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Routing provider down',
        instance: new URL(route.request().url()).pathname,
        code: 'internal_error',
      },
    }),
  );
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('radio', { name: 'Drive' })
    .check();

  await expect(page.getByRole('alert').filter({ hasText: 'Route unavailable.' })).toBeVisible();
  await expect(firstLeg).toHaveAccessibleName(/by car: ≈ .+ \(estimate\)/);
  await expect(page.getByText(/includes estimates/)).toBeVisible();
  await expectAccessible(page);
});
