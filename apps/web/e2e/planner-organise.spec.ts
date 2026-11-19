import type { Locator, Page } from '@playwright/test';
import { arrangeTrip, dayPlaceNames, PLACES, readPlan } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { dayChip, openPlanner, openRowMenu, stopList, toasts } from './support/planner';

test.use({ locale: 'pt-BR' });

const BELEM = [PLACES.torreDeBelem, PLACES.mosteiroDosJeronimos, PLACES.pasteisDeBelem] as const;

/** Row names of a day list, in order. */
function rows(page: Page, dayNumber: number): Locator {
  return stopList(page, dayNumber).getByRole('listitem');
}

/** Drags a row by its ≡ handle onto another row with the mouse (desktop pointer sensor). */
async function dragRow(page: Page, name: string, onto: string): Promise<void> {
  const handle = page.getByRole('button', { name: `Mover ${name}` });
  const target = page.getByRole('button', { name: `Mover ${onto}` });
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error('Drag handles have no box');
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 2 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, { steps: 10 });
  await page.mouse.up();
}

test('reorders_a_day_and_the_order_survives_a_reload', async ({ page, account }, testInfo) => {
  const trip = await arrangeTrip(account.api, { title: 'Belém', days: [BELEM] });
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}`);
  await expect(rows(page, 1)).toHaveText([/Torre de Belém/, /Mosteiro/, /Pastéis de Belém/]);

  if (testInfo.project.use.isMobile) {
    const menu = await openRowMenu(page, 'Pastéis de Belém');
    await menu.getByRole('button', { name: 'Mover para cima' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'agora 2 de 3 no Dia 1' }),
    ).toBeAttached();
  } else {
    await dragRow(page, 'Pastéis de Belém', 'Torre de Belém');
  }

  const expected = testInfo.project.use.isMobile
    ? [/Torre de Belém/, /Pastéis de Belém/, /Mosteiro/]
    : [/Pastéis de Belém/, /Torre de Belém/, /Mosteiro/];
  await expect(rows(page, 1)).toHaveText(expected);
  await expect
    .poll(async () => dayPlaceNames(await readPlan(account.api, trip.id), 0).join(' | '))
    .toMatch(new RegExp(expected.map((name) => name.source).join('.* \\| ')));
  await expectAccessible(page);

  await page.reload();
  await expect(rows(page, 1)).toHaveText(expected);
});

test('moves_a_stop_to_day_2_follows_it_with_the_chips_and_back_deselects', async ({
  page,
  account,
}) => {
  const trip = await arrangeTrip(account.api, { title: 'Dois dias', days: [BELEM, []] });
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}`);

  const menu = await openRowMenu(page, 'Mosteiro dos Jerónimos');
  await menu.getByRole('button', { name: 'Dia 2' }).click();

  await expect(rows(page, 1)).toHaveText([/Torre de Belém/, /Pastéis de Belém/]);
  await expect(
    page.getByRole('status').filter({ hasText: 'agora 1 de 1 no Dia 2' }),
  ).toBeAttached();
  await dayChip(page, 'Dia 2').click();
  await expect(dayChip(page, 'Dia 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(new RegExp(`day=${trip.plan.days[1]?.id}`));
  await expect(rows(page, 2)).toHaveText([/Mosteiro dos Jerónimos/]);

  // Selecting a place pushes `place`; Back takes it away again (V51).
  await rows(page, 2)
    .getByRole('button', { name: /^Mosteiro dos Jerónimos/ })
    .click();
  await expect(page).toHaveURL(/[?&]place=/);
  await expect(
    page.getByRole('heading', { level: 3, name: 'Mosteiro dos Jerónimos' }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]place=/);
  await expect(rows(page, 2)).toHaveText([/Mosteiro dos Jerónimos/]);
  await expect(dayChip(page, 'Dia 2')).toHaveAttribute('aria-pressed', 'true');
});

test('optimises_a_day_applies_the_order_and_undoes_it', async ({ page, account }) => {
  // Belém → Baixa → Belém → Castelo: going back and forth along the river.
  const order = [
    PLACES.torreDeBelem,
    PLACES.pracaDoComercio,
    PLACES.padraoDosDescobrimentos,
    PLACES.casteloDeSaoJorge,
  ];
  const trip = await arrangeTrip(account.api, { title: 'Zigue-zague', days: [order] });
  const before = dayPlaceNames(trip.plan, 0);
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}`);

  await page.getByRole('button', { name: 'Otimizar ordem' }).click();
  const preview = page.getByRole('dialog', { name: 'Otimizar o Dia 1' });
  await expect(preview.getByRole('list', { name: 'Ordem sugerida' })).toBeVisible();
  await expect(preview.getByRole('checkbox', { name: 'Manter último lugar' })).toBeChecked();
  await expectAccessible(page);
  await preview.getByRole('button', { name: 'Aplicar' }).click();

  const applied = toasts(page).getByRole('listitem').filter({ hasText: 'Nova ordem aplicada' });
  await expect(applied).toBeVisible();
  await expect(rows(page, 1)).toHaveText([
    /Torre de Belém/,
    /Padrão dos Descobrimentos/,
    /Praça do Comércio/,
    /Castelo de São Jorge/,
  ]);
  await applied.getByRole('button', { name: 'Desfazer' }).click();

  await expect(rows(page, 1)).toHaveText(before.map((name) => new RegExp(name)));
  await expect
    .poll(async () => dayPlaceNames(await readPlan(account.api, trip.id), 0))
    .toEqual(before);
});

test('keeps_a_note_after_a_reload', async ({ page, account }) => {
  const trip = await arrangeTrip(account.api, { title: 'Com notas', days: [[PLACES.lxFactory]] });
  const tripPlaceId = trip.plan.places[0]?.id ?? '';
  await openPlanner(page, trip.id, `?day=${trip.plan.days[0]?.id}&place=${tripPlaceId}`);

  const note = page.getByRole('textbox', { name: 'Sua nota' });
  await note.fill('Livraria Ler Devagar no fundo, à esquerda.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Sua nota' })).toHaveValue(
    'Livraria Ler Devagar no fundo, à esquerda.',
  );
});
