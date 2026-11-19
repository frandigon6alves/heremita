import { dayRouteSchema, endpoints, type DayRoute } from '@heremita/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProviderError } from '../../src/providers/core/contract.js';
import { ESTIMATE_DETOUR_FACTOR } from '../../src/providers/core/estimates.js';
import { haversineMeters } from '../../src/providers/core/geo.js';
import { FAKE_DETOUR_FACTOR } from '../../src/providers/fake/fake-router.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { anonymous, expectProblem } from '../support/assertions.js';
import { createUser, publishTrip, type TestUser } from '../support/factories.js';
import { sendRaw, type HttpClient } from '../support/http.js';
import { at, CountingRouter, LISBON, OFF_NETWORK, RouteRows } from './route-rows.js';

let t: TestApp;
let router: CountingRouter;
let rows: RouteRows;

beforeAll(async () => {
  router = new CountingRouter();
  t = await buildTestApp({ routing: router });
  rows = new RouteRows(t);
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  router.calls.length = 0;
  router.failure = undefined;
  await t.prisma.providerCache.deleteMany();
});

function getRoute(
  client: HttpClient,
  tripId: string,
  dayId: string,
  query?: Record<string, unknown>,
) {
  return sendRaw(client, endpoints.getDayRoute, { params: { tripId, dayId }, query });
}

function getShared(client: HttpClient, shareToken: string, dayId: string) {
  return sendRaw(client, endpoints.getSharedDayRoute, { params: { shareToken, dayId } });
}

function routeOf(response: request.Response): DayRoute {
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return dayRouteSchema.parse(response.body);
}

let owner: TestUser;

beforeEach(async () => {
  owner = await createUser(t);
});

describe('GET /trips/{tripId}/days/{dayId}/route (E40)', () => {
  it('routes_every_leg_for_the_owner_with_private_no_cache', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));

    const response = await getRoute(owner.agent, day.tripId, day.dayId);

    const route = routeOf(response);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    expect(route).toMatchObject({
      dayId: day.dayId,
      planVersion: 0,
      modeOverride: null,
      quality: 'routed',
      attribution: '© OpenStreetMap contributors',
    });
    expect(route.legs.map((leg) => [leg.fromStopId, leg.toStopId])).toEqual([
      [day.stopIds[0], day.stopIds[1]],
      [day.stopIds[1], day.stopIds[2]],
    ]);
    expect(route.legs[0]).toMatchObject({
      mode: 'walk',
      provider: 'fake',
      estimated: false,
      unroutable: false,
      distanceMeters: Math.round(haversineMeters(LISBON[0]!, LISBON[1]!) * FAKE_DETOUR_FACTOR),
    });
    expect(route.distanceMeters).toBe(
      route.legs[0]!.distanceMeters + route.legs[1]!.distanceMeters,
    );
  });

  it('answers_the_current_plan_version', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 2)));
    await t.prisma.trip.update({ where: { id: day.tripId }, data: { planVersion: 7 } });

    expect(routeOf(await getRoute(owner.agent, day.tripId, day.dayId)).planVersion).toBe(7);
  });

  it('serves_a_repeat_read_from_the_cache_without_a_provider_call', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));

    const first = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));
    const second = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));

    expect(router.calls).toHaveLength(1);
    expect(second).toEqual(first);
    expect(await rows.legCacheKeys()).toEqual([
      'leg:v1:fake:walk:-9.13660,38.70750>-9.13930,38.71010',
      'leg:v1:fake:walk:-9.13930,38.71010>-9.14280,38.71390',
    ]);
  });

  it('routes_only_the_uncached_legs', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));
    await getRoute(owner.agent, day.tripId, day.dayId);
    const more = await rows.trip(owner, at(...LISBON.slice(0, 4)));
    router.calls.length = 0;

    const route = routeOf(await getRoute(owner.agent, more.tripId, more.dayId));

    expect(route.quality).toBe('routed');
    expect(router.calls.map((call) => call.stops)).toEqual([[LISBON[2], LISBON[3]]]);
  });

  it('calls_the_provider_once_per_run_of_same_mode_legs', async () => {
    const day = await rows.trip(owner, [
      { at: LISBON[0]! },
      { at: LISBON[1]!, modeToNext: 'drive' },
      { at: LISBON[2]!, modeToNext: 'drive' },
      { at: LISBON[3]! },
      { at: LISBON[4]! },
    ]);

    const route = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));

    expect(route.legs.map((leg) => leg.mode)).toEqual(['walk', 'drive', 'drive', 'walk']);
    expect(router.calls.map((call) => [call.mode, call.stops.length])).toEqual([
      ['walk', 2],
      ['drive', 3],
      ['walk', 2],
    ]);
  });

  it('takes_the_day_mode_then_the_trip_default_for_legs_without_their_own', async () => {
    const day = await rows.trip(owner, [
      { at: LISBON[0]!, modeToNext: 'bike' },
      { at: LISBON[1]! },
      { at: LISBON[2]! },
    ]);
    await t.prisma.trip.update({ where: { id: day.tripId }, data: { defaultMode: 'drive' } });

    const tripDefault = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));
    await t.prisma.day.update({ where: { id: day.dayId }, data: { modeOverride: 'walk' } });
    const dayOverride = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));

    expect(tripDefault.legs.map((leg) => leg.mode)).toEqual(['bike', 'drive']);
    expect(dayOverride.legs.map((leg) => leg.mode)).toEqual(['bike', 'walk']);
  });

  it('mode_query_overrides_every_leg_and_stores_nothing_on_the_plan', async () => {
    const day = await rows.trip(owner, [
      { at: LISBON[0]!, modeToNext: 'drive' },
      { at: LISBON[1]! },
      { at: LISBON[2]! },
    ]);

    const route = routeOf(await getRoute(owner.agent, day.tripId, day.dayId, { mode: 'bike' }));

    expect(route.modeOverride).toBe('bike');
    expect(route.legs.map((leg) => leg.mode)).toEqual(['bike', 'bike']);
    expect(router.calls.map((call) => call.mode)).toEqual(['bike']);
    const stop = await t.prisma.stop.findUniqueOrThrow({ where: { id: day.stopIds[0] } });
    const trip = await t.prisma.trip.findUniqueOrThrow({ where: { id: day.tripId } });
    expect(stop.modeToNext).toBe('drive');
    expect(trip.planVersion).toBe(0);
  });

  it('estimates_every_leg_and_caches_nothing_when_the_provider_is_down', async () => {
    router.failure = new ProviderError('fake', 'unavailable', 'down');
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));

    const route = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));

    expect(route.quality).toBe('estimated');
    expect(
      route.legs.every((leg) => leg.estimated && leg.provider === 'estimate' && !leg.unroutable),
    ).toBe(true);
    expect(route.legs[0]!.distanceMeters).toBe(
      Math.round(haversineMeters(LISBON[0]!, LISBON[1]!) * ESTIMATE_DETOUR_FACTOR),
    );
    expect(await rows.legCacheKeys()).toEqual([]);
  });

  it('marks_the_legs_of_the_stop_the_provider_could_not_place_unroutable', async () => {
    router.failure = new ProviderError('fake', 'unroutable_stop', 'no segment', { stopIndex: 1 });
    const day = await rows.trip(owner, at(...LISBON.slice(0, 4)));

    const route = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));

    expect(route.legs.map((leg) => [leg.estimated, leg.unroutable])).toEqual([
      [true, true],
      [true, true],
      [true, false],
    ]);
  });

  it('marks_legs_of_a_stop_off_the_network_unroutable_and_caches_only_routed_legs', async () => {
    const day = await rows.trip(owner, at(LISBON[0]!, LISBON[1]!, OFF_NETWORK));

    const route = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));

    expect(route.quality).toBe('partial');
    expect(route.legs.map((leg) => [leg.estimated, leg.unroutable, leg.provider])).toEqual([
      [false, false, 'fake'],
      [true, true, 'estimate'],
    ]);
    expect(await rows.legCacheKeys()).toHaveLength(1);
  });

  it('answers_an_empty_route_for_a_day_with_fewer_than_two_stops', async () => {
    const empty = await rows.trip(owner, []);
    const single = await rows.trip(owner, at(LISBON[0]!));

    for (const day of [empty, single]) {
      const route = routeOf(await getRoute(owner.agent, day.tripId, day.dayId));
      expect(route).toMatchObject({
        legs: [],
        distanceMeters: 0,
        durationSeconds: 0,
        quality: 'routed',
      });
    }
    expect(router.calls).toEqual([]);
  });

  it('rejects_an_unknown_mode_with_a_query_pointer', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 2)));

    const problem = expectProblem(
      await getRoute(owner.agent, day.tripId, day.dayId, { mode: 'fly' }),
      422,
      'validation_failed',
    );

    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/query/mode']);
  });

  it('rejects_an_unknown_query_key', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 2)));

    const problem = expectProblem(
      await getRoute(owner.agent, day.tripId, day.dayId, { profile: 'foot' }),
      422,
      'validation_failed',
    );

    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/query/profile']);
  });

  it('answers_not_found_for_a_day_of_another_trip', async () => {
    const mine = await rows.trip(owner, at(...LISBON.slice(0, 2)));
    const other = await rows.trip(owner, at(...LISBON.slice(0, 2)));

    expectProblem(await getRoute(owner.agent, mine.tripId, other.dayId), 404, 'not_found');
  });

  it('answers_trip_not_found_for_a_strangers_private_trip', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 2)));
    const stranger = await createUser(t);

    expectProblem(await getRoute(stranger.agent, day.tripId, day.dayId), 404, 'trip_not_found');
    expectProblem(await getRoute(anonymous(t), day.tripId, day.dayId), 404, 'trip_not_found');
    expect(router.calls).toEqual([]);
  });

  it('lets_a_signed_in_viewer_of_a_public_trip_reach_the_provider', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));
    await publishTrip(owner.agent, day.tripId);
    const viewer = await createUser(t);

    const route = routeOf(await getRoute(viewer.agent, day.tripId, day.dayId));

    expect(route.quality).toBe('routed');
    expect(router.calls).toHaveLength(1);
  });

  it('gives_anonymous_viewers_cached_legs_and_estimates_without_a_provider_call', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));
    await publishTrip(owner.agent, day.tripId);

    const cold = routeOf(await getRoute(anonymous(t), day.tripId, day.dayId));
    expect(cold.quality).toBe('estimated');
    expect(router.calls).toEqual([]);

    await getRoute(owner.agent, day.tripId, day.dayId);
    router.calls.length = 0;
    const warm = routeOf(await getRoute(anonymous(t), day.tripId, day.dayId));

    expect(warm.quality).toBe('routed');
    expect(router.calls).toEqual([]);
  });

  it('throttles_the_sixth_route_read_within_the_window', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 2)));
    const statuses: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      statuses.push((await getRoute(owner.agent, day.tripId, day.dayId)).status);
    }
    const limited = await getRoute(owner.agent, day.tripId, day.dayId);

    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    expectProblem(limited, 429, 'rate_limited');
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
  });
});

describe('GET /shared/{shareToken}/days/{dayId}/route (E27)', () => {
  it('routes_a_link_trip_day_for_a_token_holder_with_private_no_cache', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));
    const trip = await publishTrip(owner.agent, day.tripId, 'link');
    const viewer = await createUser(t);

    const response = await getShared(viewer.agent, trip.shareToken!, day.dayId);

    expect(routeOf(response).quality).toBe('routed');
    expect(response.headers['cache-control']).toBe('private, no-cache');
    expect(router.calls).toHaveLength(1);
  });

  it('gives_anonymous_token_holders_estimates_without_a_provider_call', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 3)));
    const trip = await publishTrip(owner.agent, day.tripId, 'link');

    const route = routeOf(await getShared(anonymous(t), trip.shareToken!, day.dayId));

    expect(route.quality).toBe('estimated');
    expect(router.calls).toEqual([]);
  });

  it('answers_trip_not_found_once_the_trip_is_private_again', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 2)));
    const trip = await publishTrip(owner.agent, day.tripId, 'link');
    await t.prisma.trip.update({ where: { id: day.tripId }, data: { visibility: 'private' } });

    expectProblem(await getShared(owner.agent, trip.shareToken!, day.dayId), 404, 'trip_not_found');
  });

  it('answers_not_found_for_a_day_of_another_trip', async () => {
    const day = await rows.trip(owner, at(...LISBON.slice(0, 2)));
    const other = await rows.trip(owner, at(...LISBON.slice(0, 2)));
    const trip = await publishTrip(owner.agent, day.tripId, 'link');

    expectProblem(await getShared(anonymous(t), trip.shareToken!, other.dayId), 404, 'not_found');
  });
});
