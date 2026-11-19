import { endpoints } from '@heremita/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  failWith,
  onEndpoint,
  okResponse,
  problemResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { ExploreResults } from './explore-results';
import { buildPublicTripCard, page } from './test-support';

const server = setupApiServer();

describe('ExploreResults', () => {
  it('renders_the_server_page_without_fetching', () => {
    renderWithProviders(
      <ExploreResults q="" initialPage={page([buildPublicTripCard({ title: 'Rio a pé' })])} />,
    );

    expect(screen.getByRole('heading', { name: 'Rio a pé' })).toBeVisible();
  });

  it('fetches_with_the_search_text_and_shows_a_skeleton_meanwhile', async () => {
    const queries: Array<string | null> = [];
    server.use(
      onEndpoint(endpoints.listPublicTrips, ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('q'));
        return okResponse(endpoints.listPublicTrips, page([buildPublicTripCard()]));
      }),
    );
    renderWithProviders(<ExploreResults q="lisboa" />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Lisboa a pé' })).toBeVisible();
    expect(queries).toEqual(['lisboa']);
  });

  it('loads_more_with_the_cursor_until_the_last_page', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      onEndpoint(endpoints.listPublicTrips, ({ request }) => {
        cursors.push(new URL(request.url).searchParams.get('cursor'));
        return okResponse(
          endpoints.listPublicTrips,
          page([buildPublicTripCard({ title: 'Paris de bicicleta' })]),
        );
      }),
    );
    const { user } = renderWithProviders(
      <ExploreResults q="" initialPage={page([buildPublicTripCard()], 'cursor-2')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Paris de bicicleta' })).toBeVisible();
    expect(cursors).toEqual(['cursor-2']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('keeps_the_cards_and_explains_when_load_more_fails', async () => {
    server.use(failWith(endpoints.listPublicTrips, 'internal_error'));
    const { user } = renderWithProviders(
      <ExploreResults q="" initialPage={page([buildPublicTripCard()], 'cursor-2')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('More trips could not be loaded.');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('says_there_are_no_public_trips_yet_without_a_search', () => {
    renderWithProviders(<ExploreResults q="" initialPage={page([])} />);

    expect(screen.getByRole('heading', { name: 'No public trips yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Plan it yourself' })).toHaveAttribute(
      'href',
      '/en/trips/new',
    );
  });

  it('names_the_search_when_it_finds_nothing', () => {
    renderWithProviders(<ExploreResults q="Fiji" initialPage={page([])} />, { locale: 'pt-BR' });

    expect(
      screen.getByRole('heading', { name: 'Ainda não há viagens públicas para “Fiji”' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Planeje você mesmo' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver todas as viagens públicas' })).toHaveAttribute(
      'href',
      '/pt-BR/explore',
    );
  });

  it('shows_an_error_with_code_request_id_and_retry', async () => {
    let attempts = 0;
    server.use(
      onEndpoint(endpoints.listPublicTrips, () => {
        attempts += 1;
        return attempts === 1
          ? problemResponse('internal_error')
          : okResponse(endpoints.listPublicTrips, page([buildPublicTripCard()]));
      }),
    );
    const { user } = renderWithProviders(<ExploreResults q="" />);

    expect(
      await screen.findByRole('heading', { name: 'Public trips could not be loaded.' }),
    ).toBeVisible();
    expect(screen.getByText('Code: internal_error')).toBeVisible();
    expect(screen.getByText(`Request ID: ${TEST_REQUEST_ID}`)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('article')).toBeVisible();
  });
});
