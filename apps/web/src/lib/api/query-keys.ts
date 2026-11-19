import {
  endpoints,
  LIMITS,
  type LngLat,
  type Locale,
  type Me,
  type ReportStatus,
  type ReviewSort,
  type TravelMode,
  placeSearchIntentSchema,
} from '@heremita/shared';
import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiFetch } from './client';
import { isUnauthenticated } from './problem';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Every page of a keyset list starts without a cursor. */
const FIRST_PAGE: string | null = null;

/** `nextCursor` is `null` on the last page, which TanStack reads as "no next page". */
const nextCursor = (page: { nextCursor: string | null }) => page.nextCursor;

/** `undefined` leaves the cursor out of the query string on the first page. */
const cursorQuery = (cursor: string | null) => ({ cursor: cursor ?? undefined });

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Search text as the key and the request see it; `q` length is checked on this form. */
export function normaliseSearchText(q: string): string {
  return q.normalize('NFKC').trim();
}

type PlaceSearchIntent = (typeof placeSearchIntentSchema.options)[number];

export interface PlaceSearchInput {
  q: string;
  locale: Locale;
  intent: PlaceSearchIntent;
  /** Map centre; rounded to 2 decimals (~1 km) so small pans reuse the cached answer. */
  near?: LngLat;
  zoom?: number;
}

export interface ReverseInput extends LngLat {
  locale: Locale;
}

/**
 * Query keys and options of §I.web.keys. Prefix keys (`trips.all`,
 * `trips.trip(id)` …) exist for `invalidateQueries`; every input of a
 * `queryFn` is part of its key.
 */
export const queryKeys = {
  viewer: ['viewer'] as const,
  trips: {
    all: ['trips'] as const,
    mine: ['trips', 'mine'] as const,
    trip: (tripId: string) => ['trips', tripId] as const,
    plan: (tripId: string) => ['trips', tripId, 'plan'] as const,
    route: (tripId: string, dayId: string, planVersion: number, mode: TravelMode | null) =>
      ['trips', tripId, 'route', dayId, planVersion, mode] as const,
    orderSuggestion: (tripId: string, dayId: string, planVersion: number, keepLast: boolean) =>
      ['trips', tripId, 'order-suggestion', dayId, planVersion, keepLast] as const,
  },
  shared: {
    plan: (shareToken: string) => ['shared', shareToken, 'plan'] as const,
    route: (shareToken: string, dayId: string, planVersion: number, mode: TravelMode | null) =>
      ['shared', shareToken, 'route', dayId, planVersion, mode] as const,
  },
  places: {
    all: ['places'] as const,
    search: ({ q, locale, near, zoom, intent }: PlaceSearchInput) =>
      [
        'places',
        'search',
        {
          q: normaliseSearchText(q),
          locale,
          near: near && { lng: round(near.lng, 2), lat: round(near.lat, 2) },
          zoom,
          intent,
        },
      ] as const,
    reverse: ({ lng, lat, locale }: ReverseInput) =>
      ['places', 'reverse', { lng: round(lng, 4), lat: round(lat, 4), locale }] as const,
    place: (placeId: string) => ['places', placeId] as const,
    reviews: (placeId: string, sort: ReviewSort) => ['places', placeId, 'reviews', sort] as const,
  },
  explore: {
    all: ['explore'] as const,
    list: (q: string) => ['explore', { q: q.trim() }] as const,
  },
  users: {
    user: (userId: string) => ['users', userId] as const,
    trips: (userId: string) => ['users', userId, 'trips'] as const,
    reviews: (userId: string) => ['users', userId, 'reviews'] as const,
  },
  me: {
    blocks: ['me', 'blocks'] as const,
  },
  moderation: {
    all: ['moderation'] as const,
    reports: (status: ReportStatus) => ['moderation', 'reports', status] as const,
  },
};

/** E8. Signed out is an answer (`null`), not an error: never redirects to login. */
export const viewerQuery = () =>
  queryOptions({
    queryKey: queryKeys.viewer,
    queryFn: async ({ signal }): Promise<Me | null> => {
      try {
        return await apiFetch(endpoints.getMe, { signal });
      } catch (error) {
        if (isUnauthenticated(error)) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * MINUTE,
  });

/** E18, newest change first; "Load more" fetches the next page. */
export const myTripsQuery = () =>
  infiniteQueryOptions({
    queryKey: queryKeys.trips.mine,
    queryFn: ({ pageParam, signal }) =>
      apiFetch(endpoints.listMyTrips, { query: cursorQuery(pageParam), signal }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
    staleTime: 30 * SECOND,
  });

/** E20. */
export const tripQuery = (tripId: string) =>
  queryOptions({
    queryKey: queryKeys.trips.trip(tripId),
    queryFn: ({ signal }) => apiFetch(endpoints.getTrip, { params: { tripId }, signal }),
    staleTime: 30 * SECOND,
  });

/** E24. The planner passes the RSC payload as `initialData` + `initialDataUpdatedAt`. */
export const planQuery = (tripId: string) =>
  queryOptions({
    queryKey: queryKeys.trips.plan(tripId),
    queryFn: ({ signal }) => apiFetch(endpoints.getTripPlan, { params: { tripId }, signal }),
    staleTime: 30 * SECOND,
    refetchOnWindowFocus: true,
  });

const routeOptions = {
  // A route never changes for one plan version + mode: a new version is a new key.
  staleTime: Infinity,
  gcTime: 30 * MINUTE,
  // The previous route stays on screen (dimmed) while the new one loads.
  placeholderData: keepPreviousData,
} as const;

/**
 * E40. `mode` = URL mode, or `null` for the day's saved modes. Callers enable
 * it for every visible day with at least two stops: the plan's summaries carry
 * no polylines, and the map needs them (ID-T60).
 */
export const dayRouteQuery = (
  tripId: string,
  dayId: string,
  planVersion: number,
  mode: TravelMode | null,
) =>
  queryOptions({
    queryKey: queryKeys.trips.route(tripId, dayId, planVersion, mode),
    queryFn: ({ signal }) =>
      apiFetch(endpoints.getDayRoute, {
        params: { tripId, dayId },
        query: mode === null ? {} : { mode },
        signal,
      }),
    ...routeOptions,
  });

/** E41. Callers set `enabled` only while the optimise preview is open. */
export const orderSuggestionQuery = (
  tripId: string,
  dayId: string,
  planVersion: number,
  keepLast: boolean,
) =>
  queryOptions({
    queryKey: queryKeys.trips.orderSuggestion(tripId, dayId, planVersion, keepLast),
    queryFn: ({ signal }) =>
      apiFetch(endpoints.getOrderSuggestion, {
        params: { tripId, dayId },
        query: { keepLast: keepLast ? 'true' : 'false' },
        signal,
      }),
    staleTime: Infinity,
  });

/** E26. */
export const sharedPlanQuery = (shareToken: string) =>
  queryOptions({
    queryKey: queryKeys.shared.plan(shareToken),
    queryFn: ({ signal }) => apiFetch(endpoints.getSharedPlan, { params: { shareToken }, signal }),
    staleTime: 30 * SECOND,
  });

/** E27, as `dayRouteQuery`. */
export const sharedDayRouteQuery = (
  shareToken: string,
  dayId: string,
  planVersion: number,
  mode: TravelMode | null,
) =>
  queryOptions({
    queryKey: queryKeys.shared.route(shareToken, dayId, planVersion, mode),
    queryFn: ({ signal }) =>
      apiFetch(endpoints.getSharedDayRoute, {
        params: { shareToken, dayId },
        query: mode === null ? {} : { mode },
        signal,
      }),
    ...routeOptions,
  });

/**
 * E42. Runs only once the text has `SEARCH_Q_MIN` characters; the caller
 * debounces typing (300 ms) and TanStack aborts superseded requests.
 */
export const placeSearchQuery = (input: PlaceSearchInput) => {
  const queryKey = queryKeys.places.search(input);
  const { q, locale, near, zoom, intent } = queryKey[2];
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) =>
      apiFetch(endpoints.searchPlaces, {
        query: { q, locale, intent, near: near && `${near.lng},${near.lat}`, zoom },
        signal,
      }),
    enabled: q.length >= LIMITS.SEARCH_Q_MIN,
    staleTime: 5 * MINUTE,
  });
};

/** E43. On an explicit tap or long-press, and in "Add here" mode once each map move settles. */
export const reversePlacesQuery = (input: ReverseInput) => {
  const queryKey = queryKeys.places.reverse(input);
  const { lng, lat, locale } = queryKey[2];
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) =>
      apiFetch(endpoints.reversePlaces, { query: { lng, lat, locale }, signal }),
    staleTime: HOUR,
  });
};

/** E44. */
export const placeQuery = (placeId: string) =>
  queryOptions({
    queryKey: queryKeys.places.place(placeId),
    queryFn: ({ signal }) => apiFetch(endpoints.getPlace, { params: { placeId }, signal }),
    staleTime: 5 * MINUTE,
  });

/** E45. */
export const placeReviewsQuery = (placeId: string, sort: ReviewSort) =>
  infiniteQueryOptions({
    queryKey: queryKeys.places.reviews(placeId, sort),
    queryFn: ({ pageParam, signal }) =>
      apiFetch(endpoints.listPlaceReviews, {
        params: { placeId },
        query: { sort, ...cursorQuery(pageParam) },
        signal,
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
    staleTime: MINUTE,
  });

/** E48. An empty `q` lists every public trip. */
export const exploreQuery = (q: string) => {
  const queryKey = queryKeys.explore.list(q);
  const text = queryKey[1].q;
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      apiFetch(endpoints.listPublicTrips, {
        query: { q: text === '' ? undefined : text, ...cursorQuery(pageParam) },
        signal,
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
    staleTime: MINUTE,
  });
};

/** E15. */
export const userProfileQuery = (userId: string) =>
  queryOptions({
    queryKey: queryKeys.users.user(userId),
    queryFn: ({ signal }) => apiFetch(endpoints.getUserProfile, { params: { userId }, signal }),
    staleTime: MINUTE,
  });

/** E16. */
export const userTripsQuery = (userId: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.users.trips(userId),
    queryFn: ({ pageParam, signal }) =>
      apiFetch(endpoints.listUserTrips, {
        params: { userId },
        query: cursorQuery(pageParam),
        signal,
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
    staleTime: MINUTE,
  });

/** E17. */
export const userReviewsQuery = (userId: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.users.reviews(userId),
    queryFn: ({ pageParam, signal }) =>
      apiFetch(endpoints.listUserReviews, {
        params: { userId },
        query: cursorQuery(pageParam),
        signal,
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
    staleTime: MINUTE,
  });

/** E12. */
export const myBlocksQuery = () =>
  infiniteQueryOptions({
    queryKey: queryKeys.me.blocks,
    queryFn: ({ pageParam, signal }) =>
      apiFetch(endpoints.listBlocks, { query: cursorQuery(pageParam), signal }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
    staleTime: MINUTE,
  });

/** E50. Always refetched: another moderator may have decided meanwhile. */
export const moderationReportsQuery = (status: ReportStatus) =>
  infiniteQueryOptions({
    queryKey: queryKeys.moderation.reports(status),
    queryFn: ({ pageParam, signal }) =>
      apiFetch(endpoints.listReports, { query: { status, ...cursorQuery(pageParam) }, signal }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
    staleTime: 0,
  });
