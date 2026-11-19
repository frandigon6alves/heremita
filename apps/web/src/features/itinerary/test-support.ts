import type {
  DayOwner,
  DayRoute,
  Leg,
  PlaceSummary,
  TripOwner,
  TripPlaceOwner,
  TripPlanOwner,
  TripPlanViewer,
} from '@heremita/shared';

export const TRIP_ID = '0195f0c8-0000-7000-8000-0000000000a1';

const uuid = (prefix: string, n: number) =>
  `0195f0c8-0000-7000-${prefix}-${String(n).padStart(12, '0')}`;

export const dayId = (n: number) => uuid('8000', 100 + n);
export const tripPlaceId = (n: number) => uuid('9000', 200 + n);
export const stopId = (n: number) => uuid('a000', 300 + n);
const placeId = (n: number) => uuid('b000', 400 + n);

const NAMES = [
  'Castelo de São Jorge',
  'Miradouro da Graça',
  'Time Out Market',
  'Belém Tower',
  'LX Factory',
];

export function buildTripPlace(n: number, overrides: Partial<PlaceSummary> = {}): TripPlaceOwner {
  return {
    id: tripPlaceId(n),
    place: {
      id: placeId(n),
      source: 'osm',
      key: `osm:W:${1000 + n}`,
      name: NAMES[(n - 1) % NAMES.length] ?? `Place ${n}`,
      label: 'Lisboa',
      category: 'sight',
      location: { lng: -9.13 + n / 100, lat: 38.71 + n / 100 },
      countryCode: 'PT',
      ...overrides,
    },
    rating: { count: 0, average: null, distribution: null },
    note: null,
    addedAt: `2026-11-1${n % 10}T10:00:00.000Z`,
  };
}

function buildTrip(overrides: Partial<TripOwner> = {}): TripOwner {
  return {
    viewerRole: 'owner',
    id: TRIP_ID,
    title: 'Lisboa a pé',
    description: null,
    destination: { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.14, lat: 38.72 } },
    startDate: null,
    dayCount: 2,
    placeCount: 5,
    defaultMode: 'walk',
    visibility: 'private',
    shareToken: null,
    author: { id: '0195f0c8-0000-7000-8000-000000000001', displayName: 'Ana', isDemo: false },
    copiedFrom: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * Lisboa trip: day 1 = places 1, 2, 3 (stops 1, 2, 3); day 2 = place 4
 * (stop 4); place 5 is an idea.
 */
export function buildPlan(overrides: Partial<TripPlanOwner> = {}): TripPlanOwner {
  const places = [1, 2, 3, 4, 5].map((n) => buildTripPlace(n));
  const days: DayOwner[] = [
    {
      id: dayId(1),
      number: 1,
      mode: 'walk',
      modeOverride: null,
      date: null,
      stops: [1, 2, 3].map((n) => ({
        id: stopId(n),
        tripPlaceId: tripPlaceId(n),
        modeToNext: null,
      })),
    },
    {
      id: dayId(2),
      number: 2,
      mode: 'walk',
      modeOverride: null,
      date: null,
      stops: [{ id: stopId(4), tripPlaceId: tripPlaceId(4), modeToNext: null }],
    },
  ];
  return {
    viewerRole: 'owner',
    trip: buildTrip(),
    planVersion: 7,
    places,
    days,
    routes: [],
    ...overrides,
  };
}

/** Names of a day's stops in order. */
export function dayNames(plan: TripPlanOwner, n: number): string[] {
  const day = plan.days.find((candidate) => candidate.number === n);
  return (day?.stops ?? []).map(
    (stop) => plan.places.find((place) => place.id === stop.tripPlaceId)?.place.name ?? '?',
  );
}

/** A two-point polyline (precision 5); geometry does not matter to the list. */
const POLYLINE = '_p~iF~ps|U_ulLnnqC';

/**
 * E40/E27 answer for a day of `plan`: every leg routed, 900 m and 12 min,
 * unless `leg` changes it (by index).
 */
export function buildDayRoute(
  plan: { planVersion: number; days: readonly Pick<DayOwner, 'id' | 'mode' | 'stops'>[] },
  dayIdValue: string,
  leg: (index: number) => Partial<Leg> = () => ({}),
): DayRoute {
  const day = plan.days.find((candidate) => candidate.id === dayIdValue);
  const stops = day?.stops ?? [];
  const legs: Leg[] = stops.slice(1).map((to, index) => ({
    fromStopId: stops[index]?.id ?? '',
    toStopId: to.id,
    mode: day?.mode ?? 'walk',
    distanceMeters: 900,
    durationSeconds: 720,
    estimated: false,
    polyline: POLYLINE,
    provider: 'fake',
    unroutable: false,
    ...leg(index),
  }));
  return {
    dayId: dayIdValue,
    planVersion: plan.planVersion,
    modeOverride: null,
    quality: legs.some((candidate) => candidate.estimated) ? 'partial' : 'routed',
    distanceMeters: legs.reduce((sum, candidate) => sum + candidate.distanceMeters, 0),
    durationSeconds: legs.reduce((sum, candidate) => sum + candidate.durationSeconds, 0),
    legs,
    attribution: '© OpenStreetMap contributors',
  };
}

/** The same Lisboa trip as a non-owner reads it (E24 public / E26): no notes, dates or share token. */
export function buildViewerPlan(overrides: Partial<TripPlanViewer> = {}): TripPlanViewer {
  const plan = buildPlan();
  const { trip } = plan;
  return {
    viewerRole: 'viewer',
    trip: {
      viewerRole: 'viewer',
      id: trip.id,
      title: trip.title,
      description: trip.description,
      destination: trip.destination,
      dayCount: trip.dayCount,
      placeCount: trip.placeCount,
      defaultMode: trip.defaultMode,
      visibility: 'public',
      author: { ...trip.author, isDemo: true },
      copiedFrom: null,
      publishedAt: '2026-11-18T10:00:00.000Z',
      copyCount: 0,
    },
    planVersion: plan.planVersion,
    places: plan.places.map(({ id, place, rating, addedAt }) => ({ id, place, rating, addedAt })),
    days: plan.days.map(({ id, number, mode, modeOverride, stops }) => ({
      id,
      number,
      mode,
      modeOverride,
      stops,
    })),
    routes: [],
    ...overrides,
  };
}
