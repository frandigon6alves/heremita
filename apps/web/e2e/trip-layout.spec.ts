import { endpoints } from '@heremita/shared';
import { arrangeTrip, PLACES } from './support/api';
import { accountTest as test, expect } from './support/fixtures';

test('the_server_html_already_lays_out_the_side_panel_on_wide_screens', async ({
  page,
  account,
  isMobile,
}) => {
  test.skip(isMobile, 'the side panel exists from 768 px');
  const trip = await arrangeTrip(account.api, {
    title: 'Belém before hydration',
    days: [[PLACES.torreDeBelem, PLACES.mosteiroDosJeronimos]],
  });
  const { shareToken } = await account.api.call(endpoints.updateTrip, {
    params: { tripId: trip.id },
    body: { visibility: 'link' },
  });

  // No app chunk loads, so nothing hydrates: the page stays the server HTML a wide screen paints first.
  await page.route('**/_next/static/**/*.js', (route) => route.abort());
  await page.goto(`/en/s/${shareToken}`);

  const panel = page.getByRole('region', { name: 'Itinerary' });
  await expect(panel).toHaveCSS('position', 'static');
  await expect(panel.getByRole('button', { name: /^Panel:/ })).toBeHidden();
  const box = await panel.boundingBox();
  expect(box?.x).toBe(0);
  expect(box?.width).toBeLessThanOrEqual(440);
});
