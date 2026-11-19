import { accountTest, expect, expectAccessible, test, uniqueEmail } from './support/fixtures';
import { arrangeTrip, readPlan } from './support/api';
import { dayChip, expectMapReady, openPlanner, stopList, toasts } from './support/planner';

test.use({ locale: 'pt-BR' });

test('signs_up_creates_a_trip_and_lands_on_its_ideas', async ({ page }, testInfo) => {
  await page.goto('/pt-BR/signup');
  await page.getByRole('textbox', { name: 'Nome' }).fill('Ana Planejadora');
  await page
    .getByRole('textbox', { name: 'E-mail' })
    .fill(uniqueEmail('journey1', testInfo.workerIndex));
  await page.getByLabel('Senha', { exact: true }).fill('uma senha bem longa');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL(/\/pt-BR\/trips\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Nova viagem' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('textbox', { name: 'Título' }).fill('Lisboa em março');
  await page.getByRole('combobox', { name: 'Destino' }).fill('Praça do Com');
  await page.getByRole('option', { name: /Praça do Comércio/ }).click();
  await page.getByRole('spinbutton', { name: 'Número de dias' }).fill('3');
  await page.getByRole('button', { name: 'Criar e abrir' }).click();

  await expect(page).toHaveURL(/\/pt-BR\/trips\/[\w-]+\?day=ideas$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lisboa em março' })).toBeVisible();
  await expect(dayChip(page, 'Ideias')).toHaveAttribute('aria-pressed', 'true');
  await expect(dayChip(page, 'Dia 3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ainda não há ideias' })).toBeVisible();
  await expectMapReady(page);
  await expectAccessible(page);
});

accountTest(
  'adds_a_search_result_to_day_1_undoes_it_and_adds_it_again',
  async ({ page, account }) => {
    const trip = await arrangeTrip(account.api, { title: 'Museus de Lisboa', days: [[]] });
    await openPlanner(page, trip.id, '?day=' + trip.plan.days[0]?.id);

    await page.getByRole('combobox', { name: 'Buscar lugares' }).fill('museu');
    await page.getByRole('option', { name: /Museu Nacional de Arte Antiga/ }).click();
    const add = page.getByRole('button', { name: 'Adicionar ao Dia 1' });
    await add.click();

    // The new stop opens its place card, on Dia 1.
    await expect(page.getByRole('button', { name: 'Dia: Dia 1' })).toBeVisible();
    await expect(page.getByText('Dia 1 · 1 lugar')).toBeVisible();
    const added = toasts(page).getByRole('listitem').filter({
      hasText: 'Museu Nacional de Arte Antiga adicionado ao Dia 1',
    });
    await expect(added).toBeVisible();
    await expectAccessible(page);
    await added.getByRole('button', { name: 'Desfazer' }).click();

    await expect(
      toasts(page).getByText('Museu Nacional de Arte Antiga excluído da viagem'),
    ).toBeVisible();
    await expect(page.getByText('Dia 1 · Nenhum lugar')).toBeVisible();
    await expect.poll(async () => (await readPlan(account.api, trip.id)).places).toEqual([]);

    // Typed key by key: the field must keep every key, also right after a pick.
    await page.getByRole('combobox', { name: 'Buscar lugares' }).pressSequentially('museu nac');
    await page.getByRole('option', { name: /Museu Nacional de Arte Antiga/ }).click();
    await page.getByRole('button', { name: 'Adicionar ao Dia 1' }).click();

    await expect(
      toasts(page).getByText('Museu Nacional de Arte Antiga adicionado ao Dia 1'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Voltar para a lista' }).click();
    await expect(stopList(page, 1).getByRole('listitem')).toHaveText([
      /Museu Nacional de Arte Antiga/,
    ]);
    await expect
      .poll(async () => (await readPlan(account.api, trip.id)).days[0]?.stops.length)
      .toBe(1);
  },
);
