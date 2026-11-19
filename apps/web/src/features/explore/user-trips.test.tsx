import { endpoints } from '@heremita/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { onEndpoint, okResponse, setupApiServer } from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { buildPublicTripCard, page } from './test-support';
import { UserTrips } from './user-trips';

const server = setupApiServer();
const USER_ID = '0195f0c8-0000-7000-8000-00000000c001';

describe('UserTrips', () => {
  it('fetches_the_users_public_trips_with_card_titles_under_the_section', async () => {
    const users: string[] = [];
    server.use(
      onEndpoint(endpoints.listUserTrips, ({ params }) => {
        users.push(params.userId);
        return okResponse(endpoints.listUserTrips, page([buildPublicTripCard()]));
      }),
    );
    renderWithProviders(<UserTrips userId={USER_ID} />);

    expect(await screen.findByRole('heading', { level: 3, name: 'Lisboa a pé' })).toBeVisible();
    expect(users).toEqual([USER_ID]);
  });

  it('says_when_there_are_none', () => {
    renderWithProviders(<UserTrips userId={USER_ID} initialPage={page([])} />, {
      locale: 'pt-BR',
    });

    expect(
      screen.getByRole('heading', { level: 3, name: 'Ainda sem viagens públicas.' }),
    ).toBeVisible();
  });
});
