import {
  endpoints,
  tripPlanOwnerSchema,
  tripPlanViewerSchema,
  type LngLat,
  type TravelMode,
} from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, cacheKeys, type CachedLeg } from '../../src/providers/core/cache-keys.js';
import type { RouteRequest, RouteResult } from '../../src/providers/core/contract.js';
import { ProviderCacheService } from '../../src/providers/core/provider-cache.service.js';
import { FakeRouter } from '../../src/providers/fake/fake-router.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { anonymous, expectProblem, UNKNOWN_ID } from '../support/assertions.js';
import { spareGazetteerKey } from '../support/authz-world.js';
import {
  createTrip,
  createUser,
  getPlan,
  publishTrip,
  type TestUser,
} from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';
import { planVersionOf } from './plan-support.js';
import { keysOf } from '../support/assertions.js';

/** The fake router, counting the calls that reach it. */
class CountingRouter extends FakeRouter {
  calls = 0;

  override route(request: RouteRequest): Promise<RouteResult> {
    this.calls += 1;
    return super.route(request);
  }
}

let t: TestApp;
let router: CountingRouter;

beforeAll(async () => {
  router = new CountingRouter();
  t = await buildTestApp({ routing: router });
});

afterAll(async () => {
  await t.close();
});

const VIEWER_FORBIDDEN_KEYS = [
  'note',
  'startDate',
  'date',
  'shareToken',
  'email',
  'createdAt',
  'updatedAt',
  'ownerId',
];

function cacheLeg(
  mode: TravelMode,
  from: LngLat,
  to: LngLat,
  leg: Omit<CachedLeg, 'snapped' | 'polyline'>,
) {
  const snapped = (location: LngLat) => ({ location, offNetworkMeters: 0, routable: true });
  return t.app
    .get(ProviderCacheService)
    .set(
      cacheKeys.leg('fake', mode, from, to),
      { ...leg, polyline: '_p~iF~ps|U_ulLnnqC', snapped: [snapped(from), snapped(to)] },
      CACHE_TTL_MS.leg,
    );
}

/** An owner with a 2-day trip (2 stops each), a noted idea, and the read plan. */
async function plannedTrip(owner: TestUser) {
  const plan = await createTrip(owner.agent, { days: 2, stopsPerDay: 2 });
  await callOk(owner.agent, 'addTripPlace', {
    params: { tripId: plan.trip.id },
    body: { place: { type: 'osm', key: spareGazetteerKey(1) }, note: 'Book a table' },
  });
  return getPlan(owner.agent, plan.trip.id);
}

describe('E24 getTripPlan', () => {
  it('gives_the_owner_trip_places_days_and_ordered_stops', async () => {
    const owner = await createUser(t);

    const plan = await plannedTrip(owner);

    expect(tripPlanOwnerSchema.safeParse(plan).success).toBe(true);
    expect(plan.viewerRole).toBe('owner');
    expect(plan.planVersion).toBe(await planVersionOf(t, plan.trip.id));
    expect(plan.trip).toMatchObject({ dayCount: 2, placeCount: 5 });
    expect(plan.days.map((day) => day.number)).toEqual([1, 2]);
    expect(plan.days.map((day) => day.stops.length)).toEqual([2, 2]);
    expect(plan.days.map((day) => [day.mode, day.modeOverride, day.date])).toEqual([
      ['walk', null, null],
      ['walk', null, null],
    ]);
    const scheduled = plan.days.flatMap((day) => day.stops.map((stop) => stop.tripPlaceId));
    expect(plan.places.map((place) => place.id).slice(0, 4)).toEqual(scheduled);
    expect(plan.places.at(-1)).toMatchObject({
      note: 'Book a table',
      rating: { count: 0, average: null, distribution: null },
    });
    expect(plan.places[0]?.place.source).toBe('osm');
    expect(plan.places[0]?.place.key).toMatch(/^osm:[NWR]:\d+$/);
  });

  it('dates_each_day_from_the_start_date_for_the_owner', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 3 });
    await callOk(owner.agent, 'updateTrip', {
      params: { tripId: plan.trip.id },
      body: { startDate: '2026-12-31' },
    });

    const dated = await getPlan(owner.agent, plan.trip.id);

    expect(dated.days.map((day) => day.date)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('gives_an_empty_trip_no_places_days_or_routes', async () => {
    const owner = await createUser(t);
    const trip = await callOk(owner.agent, 'createTrip', { body: { title: 'Empty', dayCount: 0 } });

    const plan = await getPlan(owner.agent, trip.id);

    expect(plan).toMatchObject({ places: [], days: [], routes: [] });
  });

  it('gives_others_the_viewer_shape_of_a_public_trip_without_private_keys', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const plan = await plannedTrip(owner);
    await callOk(owner.agent, 'updateTrip', {
      params: { tripId: plan.trip.id },
      body: { startDate: '2026-12-01', visibility: 'public' },
    });

    for (const client of [anonymous(t), stranger.agent]) {
      const response = await sendRaw(client, endpoints.getTripPlan, {
        params: { tripId: plan.trip.id },
      });

      expect(response.status).toBe(200);
      const viewerPlan = tripPlanViewerSchema.parse(response.body);
      expect(viewerPlan.viewerRole).toBe('viewer');
      expect(keysOf(response.body).filter((key) => VIEWER_FORBIDDEN_KEYS.includes(key))).toEqual(
        [],
      );
      expect(viewerPlan.places).toHaveLength(5);
    }
  });

  it('answers_404_to_others_for_a_private_or_link_trip', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const privateTrip = await createTrip(owner.agent);
    const linkTrip = await createTrip(owner.agent);
    await publishTrip(owner.agent, linkTrip.trip.id, 'link');

    for (const tripId of [privateTrip.trip.id, linkTrip.trip.id]) {
      for (const client of [anonymous(t), stranger.agent]) {
        const response = await sendRaw(client, endpoints.getTripPlan, { params: { tripId } });

        expectProblem(response, 404, 'trip_not_found');
      }
    }
  });

  it('answers_404_for_an_unknown_or_malformed_trip_id', async () => {
    const owner = await createUser(t);

    for (const tripId of [UNKNOWN_ID, 'not-a-uuid']) {
      const response = await sendRaw(owner.agent, endpoints.getTripPlan, { params: { tripId } });

      expectProblem(response, 404, 'trip_not_found');
    }
  });
});

describe('E24 route summaries', () => {
  it('reads_cached_legs_only_and_never_calls_the_router', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 3 });
    const location = (stopIndex: number) => {
      const tripPlaceId = plan.days[0]?.stops[stopIndex]?.tripPlaceId;
      const place = plan.places.find((candidate) => candidate.id === tripPlaceId);
      if (!place) {
        throw new Error(`No stop ${stopIndex}`);
      }
      return place.place.location;
    };
    await cacheLeg('walk', location(0), location(1), { distanceMeters: 800, durationSeconds: 600 });
    const callsBefore = router.calls;

    const partial = await getPlan(owner.agent, plan.trip.id);
    await cacheLeg('walk', location(1), location(2), { distanceMeters: 200, durationSeconds: 150 });
    const complete = await getPlan(owner.agent, plan.trip.id);

    const [first, second] = plan.days[0]?.stops ?? [];
    expect(partial.routes).toEqual([
      {
        dayId: plan.days[0]?.id,
        legs: [
          {
            fromStopId: first?.id,
            toStopId: second?.id,
            mode: 'walk',
            distanceMeters: 800,
            durationSeconds: 600,
            estimated: false,
          },
          null,
        ],
        distanceMeters: null,
        durationSeconds: null,
      },
    ]);
    expect(complete.routes[0]).toMatchObject({ distanceMeters: 1000, durationSeconds: 750 });
    expect(router.calls).toBe(callsBefore);
  });

  it('keys_each_leg_by_its_effective_mode', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 3 });
    const day = plan.days[0];
    const [a, b, c] = (day?.stops ?? []).map((stop) => {
      const place = plan.places.find((candidate) => candidate.id === stop.tripPlaceId);
      return place?.place.location ?? { lng: 0, lat: 0 };
    });
    if (!day || !a || !b || !c) {
      throw new Error('The trip needs three stops');
    }
    await callOk(owner.agent, 'updateDay', {
      params: { tripId: plan.trip.id, dayId: day.id },
      body: { modeOverride: 'bike' },
    });
    await callOk(owner.agent, 'updateStop', {
      params: { tripId: plan.trip.id, stopId: day.stops[1]?.id ?? '' },
      body: { modeToNext: 'drive' },
    });
    await cacheLeg('bike', a, b, { distanceMeters: 10, durationSeconds: 1 });
    await cacheLeg('drive', b, c, { distanceMeters: 20, durationSeconds: 2 });
    await cacheLeg('walk', a, b, { distanceMeters: 999, durationSeconds: 999 });

    const read = await getPlan(owner.agent, plan.trip.id);

    expect(read.days[0]).toMatchObject({ mode: 'bike', modeOverride: 'bike' });
    expect(read.routes[0]?.legs.map((leg) => leg && [leg.mode, leg.distanceMeters])).toEqual([
      ['bike', 10],
      ['drive', 20],
    ]);
  });
});

describe('E26 getSharedPlan', () => {
  it('gives_everyone_the_viewer_shape_through_a_valid_token_even_the_owner', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const plan = await plannedTrip(owner);
    const shared = await publishTrip(owner.agent, plan.trip.id, 'link');

    for (const client of [anonymous(t), stranger.agent, owner.agent]) {
      const response = await sendRaw(client, endpoints.getSharedPlan, {
        params: { shareToken: shared.shareToken ?? '' },
      });

      expect(response.status).toBe(200);
      const viewerPlan = tripPlanViewerSchema.parse(response.body);
      expect(viewerPlan.viewerRole).toBe('viewer');
      expect(keysOf(response.body).filter((key) => VIEWER_FORBIDDEN_KEYS.includes(key))).toEqual(
        [],
      );
      expect(viewerPlan.days).toHaveLength(2);
    }
  });

  it('answers_404_for_an_unknown_token_a_rotated_token_and_a_private_trip', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent);
    const shared = await publishTrip(owner.agent, plan.trip.id, 'link');
    await callOk(owner.agent, 'rotateShareToken', { params: { tripId: plan.trip.id } });
    const other = await createTrip(owner.agent);
    const once = await publishTrip(owner.agent, other.trip.id, 'link');
    await callOk(owner.agent, 'updateTrip', {
      params: { tripId: other.trip.id },
      body: { visibility: 'private' },
    });

    for (const shareToken of ['AAAAAAAAAAAAAAAAAAAAAA', shared.shareToken, once.shareToken]) {
      const response = await sendRaw(anonymous(t), endpoints.getSharedPlan, {
        params: { shareToken: shareToken ?? '' },
      });

      expectProblem(response, 404, 'trip_not_found');
    }
  });
});
