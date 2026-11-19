import { endpoints } from '@heremita/shared';
import type { Page } from '@playwright/test';
import { arrangeTrip, PLACES, type Account } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { expectMapReady, toasts } from './support/planner';
import { checkOnceHydrated } from './support/ui';

test.use({ locale: 'pt-BR' });

const NOTE = 'Comprar ingresso combinado na bilheteria do Mosteiro.';

async function arrangeDatedTripWithNote(account: Account, title: string) {
  const trip = await arrangeTrip(account.api, {
    title,
    days: [[PLACES.torreDeBelem, PLACES.mosteiroDosJeronimos], [PLACES.lxFactory]],
  });
  await account.api.call(endpoints.updateTrip, {
    params: { tripId: trip.id },
    body: { startDate: '2027-03-10' },
  });
  const torre = trip.plan.places.find((entry) => entry.place.name === 'Torre de Belém');
  await account.api.call(endpoints.updateTripPlace, {
    params: { tripId: trip.id, tripPlaceId: torre?.id ?? '' },
    body: { note: NOTE },
  });
  return trip;
}

async function chooseVisibility(page: Page, tripId: string, label: 'Pública' | 'Por link') {
  await page.goto(`/pt-BR/trips/${tripId}/settings`);
  const radio = page.getByRole('radio', { name: new RegExp(`^${label}`) });
  await checkOnceHydrated(radio);
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
}

test('publishes_a_trip_a_visitor_copies_it_after_logging_in', async ({
  page,
  account,
  openContext,
  makeAccount,
}) => {
  const trip = await arrangeDatedTripWithNote(account, 'Belém e arredores');

  await chooseVisibility(page, trip.id, 'Pública');
  await expectAccessible(page);

  // A visitor, signed out: the public page shows the trip without notes or dates.
  const visitorContext = await openContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/pt-BR/t/${trip.id}`);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Belém e arredores' })).toBeVisible();
  await expect(visitor.getByText(`por ${account.me.displayName}`)).toBeVisible();
  await expect(visitor.getByText('2 dias')).toBeVisible();
  await expectMapReady(visitor);
  await visitor.getByRole('button', { name: /^Torre de Belém/ }).click();
  await expect(visitor.getByRole('heading', { level: 3, name: 'Torre de Belém' })).toBeVisible();
  await expect(visitor.getByText(NOTE)).toHaveCount(0);
  await expect(visitor.getByText(/2027|10 de mar|mar\. 2027/)).toHaveCount(0);
  await expectAccessible(visitor);

  // Copy asks to log in, then resumes the copy (`?copy=1`).
  const reader = await makeAccount('Leitora');
  await visitor.getByRole('link', { name: 'Copiar' }).click();
  await expect(visitor).toHaveURL(/\/pt-BR\/login\?next=/);
  await visitor.getByRole('textbox', { name: 'E-mail' }).fill(reader.email);
  await visitor.getByLabel('Senha', { exact: true }).fill(reader.password);
  await visitor.getByRole('button', { name: 'Entrar' }).click();

  await expect(toasts(visitor).getByText('Cópia criada: Cópia de Belém e arredores')).toBeVisible();
  await visitor.goto('/pt-BR/trips');
  await expect(visitor.getByRole('link', { name: /^Cópia de Belém e arredores/ })).toBeVisible();
  await expectAccessible(visitor);
});

test('shares_a_trip_by_link_and_a_new_link_kills_the_old_one', async ({
  page,
  account,
  openContext,
}) => {
  const trip = await arrangeDatedTripWithNote(account, 'Só para amigos');

  await chooseVisibility(page, trip.id, 'Por link');
  const shareField = page.getByRole('textbox', { name: 'Link para compartilhar' });
  await expect(shareField).toHaveValue(/\/pt-BR\/s\/[\w-]+$/);
  const firstLink = await shareField.inputValue();

  const friend = await (await openContext()).newPage();
  await friend.goto(firstLink);
  await expect(friend.getByRole('heading', { level: 1, name: 'Só para amigos' })).toBeVisible();
  await expect(friend.getByText(NOTE)).toHaveCount(0);
  await expectAccessible(friend);

  await page.getByRole('button', { name: 'Gerar novo link' }).click();
  await page
    .getByRole('dialog', { name: 'Gerar um novo link?' })
    .getByRole('button', { name: 'Gerar novo link' })
    .click();
  await expect(shareField).not.toHaveValue(firstLink);
  const secondLink = await shareField.inputValue();

  await friend.reload();
  await expect(
    friend.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
  await friend.goto(secondLink);
  await expect(friend.getByRole('heading', { level: 1, name: 'Só para amigos' })).toBeVisible();
});
