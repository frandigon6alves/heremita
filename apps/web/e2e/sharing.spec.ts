import { endpoints } from '@heremita/shared';
import type { Page } from '@playwright/test';
import { arrangeTrip, PLACES, type Account } from './support/api';
import { accountTest as test, expect, expectAccessible } from './support/fixtures';
import { expectMapReady, toasts } from './support/planner';
import { checkOnceHydrated } from './support/ui';

// The whole journey runs in Spanish: owner, visitor and reader.
test.use({ locale: 'es' });

const NOTE = 'Comprar la entrada combinada en la taquilla del Monasterio.';

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

async function chooseVisibility(page: Page, tripId: string, label: 'Público' | 'Por enlace') {
  await page.goto(`/es/trips/${tripId}/settings`);
  const radio = page.getByRole('radio', { name: new RegExp(`^${label}`) });
  await checkOnceHydrated(radio);
  await page.getByRole('button', { name: 'Guardar visibilidad' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
}

test('publishes_a_trip_a_visitor_copies_it_after_logging_in', async ({
  page,
  account,
  openContext,
  makeAccount,
}) => {
  const trip = await arrangeDatedTripWithNote(account, 'Belém y alrededores');

  await chooseVisibility(page, trip.id, 'Público');
  await expectAccessible(page);

  // A visitor, signed out: the public page shows the trip without notes or dates.
  const visitorContext = await openContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/es/t/${trip.id}`);
  await expect(
    visitor.getByRole('heading', { level: 1, name: 'Belém y alrededores' }),
  ).toBeVisible();
  await expect(visitor.getByText(`por ${account.me.displayName}`)).toBeVisible();
  await expect(visitor.getByText('2 días')).toBeVisible();
  await expectMapReady(visitor);
  await visitor.getByRole('button', { name: /^Torre de Belém/ }).click();
  await expect(visitor.getByRole('heading', { level: 3, name: 'Torre de Belém' })).toBeVisible();
  await expect(visitor.getByText(NOTE)).toHaveCount(0);
  await expect(visitor.getByText(/2027|10 mar/)).toHaveCount(0);
  await expectAccessible(visitor);

  // Copy asks to log in, then resumes the copy (`?copy=1`).
  const reader = await makeAccount('Lectora');
  await visitor.getByRole('link', { name: 'Copiar' }).click();
  await expect(visitor).toHaveURL(/\/es\/login\?next=/);
  await visitor.getByRole('textbox', { name: 'Correo electrónico' }).fill(reader.email);
  await visitor.getByLabel('Contraseña', { exact: true }).fill(reader.password);
  await visitor.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(
    toasts(visitor, 'Notificaciones').getByText('Copia creada: Copia de Belém y alrededores'),
  ).toBeVisible();
  await visitor.goto('/es/trips');
  await expect(visitor.getByRole('link', { name: /^Copia de Belém y alrededores/ })).toBeVisible();
  await expectAccessible(visitor);
});

test('shares_a_trip_by_link_and_a_new_link_kills_the_old_one', async ({
  page,
  account,
  openContext,
}) => {
  const trip = await arrangeDatedTripWithNote(account, 'Solo para amigos');

  await chooseVisibility(page, trip.id, 'Por enlace');
  const shareField = page.getByRole('textbox', { name: 'Enlace para compartir' });
  await expect(shareField).toHaveValue(/\/es\/s\/[\w-]+$/);
  const firstLink = await shareField.inputValue();

  const friend = await (await openContext()).newPage();
  await friend.goto(firstLink);
  await expect(friend.getByRole('heading', { level: 1, name: 'Solo para amigos' })).toBeVisible();
  await expect(friend.getByText(NOTE)).toHaveCount(0);
  await expectAccessible(friend);

  await page.getByRole('button', { name: 'Crear un enlace nuevo' }).click();
  await page
    .getByRole('dialog', { name: '¿Crear un enlace nuevo?' })
    .getByRole('button', { name: 'Crear enlace nuevo' })
    .click();
  await expect(shareField).not.toHaveValue(firstLink);
  const secondLink = await shareField.inputValue();

  await friend.reload();
  await expect(
    friend.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
  ).toBeVisible();
  await friend.goto(secondLink);
  await expect(friend.getByRole('heading', { level: 1, name: 'Solo para amigos' })).toBeVisible();
});
