import { expect, type Locator } from '@playwright/test';

/**
 * Checks a controlled radio or checkbox. A click that lands before React has
 * hydrated the page is lost (React puts the server state back), so the check
 * is repeated until it holds.
 */
export async function checkOnceHydrated(control: Locator): Promise<void> {
  await expect(async () => {
    await control.check({ timeout: 1_000 });
  }).toPass();
}
