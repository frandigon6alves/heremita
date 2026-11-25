import { expect, type Locator, type Page } from '@playwright/test';

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

/** The gear that holds the whole navigation on phones (any language). */
function gearMenu(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: /^Men[uú]$/ });
}

/**
 * The site's main navigation as the visitor sees it, in any language: on
 * phones it sits in the gear menu (opened here), from 768 px it is spread
 * across the app bar.
 */
export async function siteNav(page: Page): Promise<Locator> {
  const open = page.locator('[popover]:popover-open');
  if (await gearMenu(page).isVisible()) {
    // A second click would close a menu a previous call left open.
    if ((await open.count()) === 0) {
      await gearMenu(page).click();
    }
    return open;
  }
  return page.getByRole('banner').getByRole('navigation').filter({ visible: true });
}

/**
 * Where a signed-in viewer's account actions (Settings, Log out) are: the gear
 * menu on phones, the account menu (avatar button) from 768 px. Opens it.
 */
export async function accountActions(page: Page): Promise<Locator> {
  const open = page.locator('[popover]:popover-open');
  if ((await open.count()) > 0) {
    return open;
  }
  if (await gearMenu(page).isVisible()) {
    await gearMenu(page).click();
  } else {
    await page
      .getByRole('banner')
      .locator('button[popovertarget]')
      .filter({ has: page.locator('[data-initial]') })
      .click();
  }
  return open;
}
