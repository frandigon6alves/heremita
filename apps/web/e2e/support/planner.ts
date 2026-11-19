import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the owner planner of a trip (in English) and waits until its map is ready. */
export async function openPlanner(page: Page, tripId: string, query = ''): Promise<void> {
  await page.goto(`/en/trips/${tripId}${query}`);
  await expectMapReady(page);
}

export async function expectMapReady(page: Page): Promise<void> {
  await expect(page.locator('[data-map-state="ready"]')).toBeVisible();
}

/** The day chips row ("Ideas", "All", "Day 1", …). */
export function dayChip(page: Page, name: string): Locator {
  return page.getByRole('group', { name: 'Days' }).getByRole('button', { name, exact: true });
}

/**
 * The toast area, named in the page's language; toasts carry their action
 * (Undo, Try again) as buttons.
 */
export function toasts(page: Page, regionName = 'Notifications'): Locator {
  return page.getByRole('region', { name: regionName });
}

/** The ordered list of place names in the open day list (row name buttons). */
export function stopList(page: Page, dayNumber: number): Locator {
  return page.getByRole('list', { name: `Places of day ${dayNumber}` });
}

/** Opens a stop row's ⋯ menu ("Actions for <name>"). */
export async function openRowMenu(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  return page.locator('[popover]:popover-open');
}
