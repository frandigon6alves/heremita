import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the owner planner of a trip and waits until its map is ready. */
export async function openPlanner(page: Page, tripId: string, query = ''): Promise<void> {
  await page.goto(`/pt-BR/trips/${tripId}${query}`);
  await expectMapReady(page);
}

export async function expectMapReady(page: Page): Promise<void> {
  await expect(page.locator('[data-map-state="ready"]')).toBeVisible();
}

/** The day chips row ("Ideias", "Todos", "Dia 1", …). */
export function dayChip(page: Page, name: string): Locator {
  return page.getByRole('group', { name: 'Dias' }).getByRole('button', { name, exact: true });
}

/** The toast area; toasts carry their action (Desfazer, Tentar de novo) as buttons. */
export function toasts(page: Page): Locator {
  return page.getByRole('region', { name: 'Notificações' });
}

/** The ordered list of place names in the open day list (row name buttons). */
export function stopList(page: Page, dayNumber: number): Locator {
  return page.getByRole('list', { name: `Lugares do dia ${dayNumber}` });
}

/** Opens a stop row's ⋯ menu ("Ações de <name>"). */
export async function openRowMenu(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: `Ações de ${name}` }).click();
  return page.locator('[popover]:popover-open');
}
