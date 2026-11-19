import { arrangeTrip, PLACES } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { openPlanner } from './support/planner';

test.use({ locale: 'pt-BR' });

test('switching_to_bike_changes_the_legs_and_a_routing_outage_falls_back_to_estimates', async ({
  page,
  account,
}) => {
  const trip = await arrangeTrip(account.api, {
    title: 'Pedalando em Belém',
    days: [[PLACES.torreDeBelem, PLACES.mosteiroDosJeronimos, PLACES.lxFactory]],
  });
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}`);

  const firstLeg = page.getByRole('button', { name: /^Rota até Mosteiro dos Jerónimos/ });
  await expect(firstLeg).toHaveAccessibleName(/a pé: \d+ min · [\d,]+ km$/);
  const walking = await firstLeg.textContent();

  await page
    .getByRole('group', { name: 'Modo de transporte' })
    .getByRole('radio', { name: 'Bicicleta' })
    .check();

  await expect(page).toHaveURL(/[?&]mode=bike/);
  await expect(firstLeg).toHaveAccessibleName(/de bicicleta: \d+ min · [\d,]+ km$/);
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
    .getByRole('group', { name: 'Modo de transporte' })
    .getByRole('radio', { name: 'Carro' })
    .check();

  await expect(page.getByRole('alert').filter({ hasText: 'Rota indisponível.' })).toBeVisible();
  await expect(firstLeg).toHaveAccessibleName(/de carro: ≈ .+ \(estimativa\)/);
  await expect(page.getByText(/inclui estimativas/)).toBeVisible();
  await expectAccessible(page);
});
