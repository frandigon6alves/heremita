import type { Page } from '@playwright/test';
import { arrangeTrip, readPlan } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { openPlanner, toasts } from './support/planner';

/** A point on the visible part of the map: centred, above the half-open sheet. */
async function visibleMapPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByRole('region', { name: /^Map of / }).boundingBox();
  if (!box) {
    throw new Error('The map region has no box');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.3 };
}

/**
 * A 700 ms touch hold through CDP. The page clock drives MapLibre's long-press
 * timer, so the hold takes no real time (no fixed sleeps).
 */
async function longPress(page: Page, point: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touchPoints = [{ x: point.x, y: point.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await page.clock.runFor(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('long_press_opens_whats_here_and_adds_a_nearby_place', async ({ page, account }, testInfo) => {
  // The page clock below also holds CSS transitions; reduced motion has none to wait for.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const trip = await arrangeTrip(account.api, { title: 'Baixa', days: [[]] });
  await page.clock.install();
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}`);

  const point = await visibleMapPoint(page);
  if (testInfo.project.use.hasTouch) {
    await longPress(page, point);
  } else {
    // Desktop twin of the touch hold: a right-click.
    await page.mouse.click(point.x, point.y, { button: 'right' });
  }

  const whatsHere = page.getByRole('region', { name: "What's here?" });
  await expect(whatsHere).toBeVisible();
  await expect(page.getByRole('button', { name: /^New pin/ })).toBeVisible();
  const nearby = whatsHere.getByRole('listitem').getByRole('button');
  await expect(nearby.first()).toBeVisible();
  await expectAccessible(page);
  await nearby.first().click();
  const picked = await page.getByRole('heading', { level: 3 }).first().textContent();
  await page.getByRole('button', { name: 'Add to day 1' }).click();

  await expect(toasts(page).getByText(`${picked} added to day 1`)).toBeVisible();
  await expect
    .poll(async () => (await readPlan(account.api, trip.id)).places.map((p) => p.place.name))
    .toEqual([picked]);
});

test('add_here_button_pins_the_map_centre_as_a_custom_place', async ({ page, account }) => {
  const trip = await arrangeTrip(account.api, { title: 'Exact spot', days: [[]] });
  await openPlanner(page, trip.id, '?day=ideas');

  const addHere = page.getByRole('button', { name: 'Add here' });
  await addHere.click();
  await expect(addHere).toHaveAttribute('aria-pressed', 'true');

  const whatsHere = page.getByRole('region', { name: "What's here?" });
  await whatsHere.getByRole('button', { name: 'Use this exact spot' }).click();
  await whatsHere.getByRole('textbox', { name: 'Name' }).fill('Meeting Joana');
  await whatsHere.getByRole('button', { name: 'Add to Ideas' }).click();

  await expect(toasts(page).getByText('Meeting Joana added to Ideas')).toBeVisible();
  await expect
    .poll(async () => (await readPlan(account.api, trip.id)).places.map((p) => p.place.name))
    .toEqual(['Meeting Joana']);
});
