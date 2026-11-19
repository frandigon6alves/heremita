import { endpoints } from '@heremita/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  failWith,
  onEndpoint,
  okResponse,
  problemResponse,
  respondWith,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { buildMyTripCard, page } from './test-support';
import { TripList } from './trip-list';

const server = setupApiServer();

describe('TripList', () => {
  it('renders_the_server_page_as_links_to_the_planner', () => {
    const trip = buildMyTripCard({ title: 'Lisboa em março', dayCount: 4, placeCount: 23 });
    renderWithProviders(<TripList initialPage={page([trip])} />, { route: '/en/trips' });

    const link = screen.getByRole('link', { name: /Lisboa em março/ });
    expect(link).toHaveAttribute('href', `/en/trips/${trip.id}`);
    expect(within(link).getByRole('heading', { level: 2 })).toHaveTextContent('Lisboa em março');
    expect(link).toHaveTextContent('4 days · 23 places');
    expect(link).toHaveTextContent('Private');
  });

  it('shows_the_dates_of_a_dated_trip_instead_of_its_day_count', () => {
    const trip = buildMyTripCard({ startDate: '2027-03-14', dayCount: 4, visibility: 'public' });
    renderWithProviders(<TripList initialPage={page([trip])} />);

    const link = screen.getByRole('link', { name: /Lisboa/ });
    expect(link).toHaveTextContent(/Mar 14\s–\s17, 2027 · 23 places/);
    expect(link).toHaveTextContent('Public');
  });

  it('counts_zero_places_and_days_in_words', () => {
    const trip = buildMyTripCard({ dayCount: 0, placeCount: 0, visibility: 'link' });
    renderWithProviders(<TripList initialPage={page([trip])} />);

    expect(screen.getByRole('link')).toHaveTextContent('No days · No places');
    expect(screen.getByRole('link')).toHaveTextContent('By link');
  });

  it('shows_a_skeleton_then_the_trips_without_a_server_page', async () => {
    server.use(respondWith(endpoints.listMyTrips, page([buildMyTripCard({ title: 'Paris' })])));
    renderWithProviders(<TripList />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Paris/ })).toBeVisible();
  });

  it('explains_an_empty_list_and_offers_a_new_trip_and_explore', () => {
    renderWithProviders(<TripList initialPage={page([])} />, { route: '/en/trips' });

    expect(screen.getByRole('heading', { name: 'You have no trips yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'New trip' })).toHaveAttribute('href', '/en/trips/new');
    expect(screen.getByRole('link', { name: 'Or copy one from Explore' })).toHaveAttribute(
      'href',
      '/en/explore',
    );
  });

  it('speaks_portuguese', () => {
    renderWithProviders(<TripList initialPage={page([])} />, { locale: 'pt-BR' });

    expect(screen.getByRole('heading', { name: 'Você ainda não tem viagens' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nova viagem' })).toHaveAttribute(
      'href',
      '/pt-BR/trips/new',
    );
  });

  it('loads_more_with_the_cursor_until_the_last_page', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      onEndpoint(endpoints.listMyTrips, ({ request }) => {
        cursors.push(new URL(request.url).searchParams.get('cursor'));
        return okResponse(endpoints.listMyTrips, page([buildMyTripCard({ title: 'Rio' })]));
      }),
    );
    const { user } = renderWithProviders(
      <TripList initialPage={page([buildMyTripCard({ title: 'Paris' })], 'cursor-2')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('link', { name: /Rio/ })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(cursors).toEqual(['cursor-2']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('keeps_the_trips_and_explains_when_load_more_fails', async () => {
    server.use(failWith(endpoints.listMyTrips, 'internal_error'));
    const { user } = renderWithProviders(
      <TripList initialPage={page([buildMyTripCard()], 'cursor-2')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('More trips could not be loaded.');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows_an_error_with_code_request_id_and_retry_when_the_list_fails', async () => {
    let attempts = 0;
    server.use(
      onEndpoint(endpoints.listMyTrips, () => {
        attempts += 1;
        return attempts === 1
          ? problemResponse('internal_error')
          : okResponse(endpoints.listMyTrips, page([buildMyTripCard({ title: 'Rio' })]));
      }),
    );
    const { user } = renderWithProviders(<TripList />);

    expect(
      await screen.findByRole('heading', { name: 'Your trips could not be loaded.' }),
    ).toBeVisible();
    expect(screen.getByText('Code: internal_error')).toBeVisible();
    expect(screen.getByText(`Request ID: ${TEST_REQUEST_ID}`)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: /Rio/ })).toBeVisible();
  });
});
