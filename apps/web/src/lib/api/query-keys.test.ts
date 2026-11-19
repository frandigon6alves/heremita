import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  dayRouteQuery,
  exploreQuery,
  firstPageData,
  myTripsQuery,
  placeSearchQuery,
  queryKeys,
  reversePlacesQuery,
  viewerQuery,
} from './query-keys';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('query keys', () => {
  it('nest_every_trip_key_under_its_trip_prefix', () => {
    const prefix = queryKeys.trips.trip('t1');

    expect(queryKeys.trips.plan('t1').slice(0, 2)).toEqual(prefix);
    expect(queryKeys.trips.route('t1', 'd1', 3, null).slice(0, 2)).toEqual(prefix);
    expect(queryKeys.trips.orderSuggestion('t1', 'd1', 3, true).slice(0, 2)).toEqual(prefix);
    expect(queryKeys.trips.mine.slice(0, 1)).toEqual(queryKeys.trips.all);
  });

  it('put_plan_version_and_mode_in_route_keys', () => {
    expect(dayRouteQuery('t1', 'd1', 4, 'bike').queryKey).toEqual([
      'trips',
      't1',
      'route',
      'd1',
      4,
      'bike',
    ]);
  });

  it('round_search_centre_to_2_decimals_and_normalise_the_text', () => {
    const { queryKey } = placeSearchQuery({
      q: '  ｍuseu ',
      locale: 'pt-BR',
      intent: 'autocomplete',
      near: { lng: -9.13934, lat: 38.71234 },
      zoom: 14,
    });

    expect(queryKey).toEqual([
      'places',
      'search',
      {
        q: 'museu',
        locale: 'pt-BR',
        near: { lng: -9.14, lat: 38.71 },
        zoom: 14,
        intent: 'autocomplete',
      },
    ]);
  });

  it('round_reverse_coordinates_to_4_decimals', () => {
    expect(reversePlacesQuery({ lng: -9.139345, lat: 38.712349, locale: 'en' }).queryKey).toEqual([
      'places',
      'reverse',
      { lng: -9.1393, lat: 38.7123, locale: 'en' },
    ]);
  });

  it('enable_search_only_from_3_characters', () => {
    const search = (q: string) => placeSearchQuery({ q, locale: 'en', intent: 'autocomplete' });

    expect(search('mu ').enabled).toBe(false);
    expect(search('mus').enabled).toBe(true);
  });
});

describe('query functions', () => {
  it('send_the_rounded_centre_as_near', async () => {
    let search = '';
    server.use(
      http.get('*/api/v1/places/search', ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ items: [] });
      }),
    );

    await new QueryClient().fetchQuery(
      placeSearchQuery({
        q: 'museu',
        locale: 'pt-BR',
        intent: 'submit',
        near: { lng: -9.13934, lat: 38.71234 },
      }),
    );

    expect(new URLSearchParams(search).get('near')).toBe('-9.14,38.71');
    expect(new URLSearchParams(search).get('intent')).toBe('submit');
  });

  it('answer_null_for_a_signed_out_viewer', async () => {
    server.use(
      http.get('*/api/v1/me', () =>
        HttpResponse.json(
          {
            type: 't',
            title: 't',
            status: 401,
            detail: 'd',
            instance: '/api/v1/me',
            code: 'unauthenticated',
          },
          { status: 401 },
        ),
      ),
    );

    await expect(new QueryClient().fetchQuery(viewerQuery())).resolves.toBeNull();
  });

  it('page_with_the_cursor_until_it_is_null', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get('*/api/v1/trips', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return HttpResponse.json({ items: [], nextCursor: cursor === null ? 'c2' : null });
      }),
    );

    const result = await new QueryClient().fetchInfiniteQuery({ ...myTripsQuery(), pages: 3 });

    expect(cursors).toEqual([null, 'c2']);
    expect(result.pageParams).toEqual([null, 'c2']);
    expect(
      myTripsQuery().getNextPageParam(result.pages[1]!, result.pages, 'c2', result.pageParams),
    ).toBeNull();
  });

  it('leave_an_empty_explore_text_out_of_the_query', async () => {
    let search = 'unset';
    server.use(
      http.get('*/api/v1/public-trips', ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    await new QueryClient().fetchInfiniteQuery(exploreQuery('  '));

    expect(search).toBe('');
  });
});

describe('firstPageData', () => {
  it('seeds_one_page_fetched_without_a_cursor', () => {
    const page = { items: [], nextCursor: 'c2' };

    expect(firstPageData(page)).toEqual({ pages: [page], pageParams: [null] });
  });
});
