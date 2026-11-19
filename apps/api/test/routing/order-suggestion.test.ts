import {
  endpoints,
  orderSuggestionSchema,
  type LngLat,
  type OrderSuggestion,
} from '@heremita/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProviderError } from '../../src/providers/core/contract.js';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';
import { expectProblem } from '../support/assertions.js';
import { createUser, publishTrip, type TestUser } from '../support/factories.js';
import { sendRaw, type HttpClient } from '../support/http.js';
import { at, CountingRouter, RouteRows } from './route-rows.js';

let t: TestApp;
let router: CountingRouter;
let rows: RouteRows;
let owner: TestUser;

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
  owner = await createUser(t);
});

/** Stops along one Lisbon street, listed in `listing` order (value = 100 m steps from the first). */
function street(...listing: number[]): LngLat[] {
  return listing.map((step) => ({ lng: -9.14 + step * 0.00115, lat: 38.71 }));
}

function suggest(
  client: HttpClient,
  tripId: string,
  dayId: string,
  query?: Record<string, unknown>,
) {
  return sendRaw(client, endpoints.getOrderSuggestion, { params: { tripId, dayId }, query });
}

function suggestionOf(response: request.Response): OrderSuggestion {
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return orderSuggestionSchema.parse(response.body);
}

describe('GET /trips/{tripId}/days/{dayId}/order-suggestion (E41)', () => {
  it('suggests_a_shorter_order_with_routed_before_and_after_totals', async () => {
    const day = await rows.trip(owner, at(...street(0, 3, 1, 2)));

    const suggestion = suggestionOf(
      await suggest(owner.agent, day.tripId, day.dayId, { keepLast: 'false' }),
    );

    const [a, b, c, d] = day.stopIds;
    expect(suggestion).toMatchObject({
      dayId: day.dayId,
      planVersion: 0,
      stopIds: [a, c, d, b],
      estimated: false,
    });
    expect(suggestion.after.distanceMeters).toBeLessThan(suggestion.before.distanceMeters);
    expect(suggestion.after.durationSeconds).toBeLessThan(suggestion.before.durationSeconds);
  });

  it('keeps_the_last_stop_last_by_default', async () => {
    const day = await rows.trip(owner, at(...street(0, 3, 1, 2)));

    const suggestion = suggestionOf(await suggest(owner.agent, day.tripId, day.dayId));

    const [a, b, c, d] = day.stopIds;
    expect(suggestion.stopIds).toEqual([a, c, b, d]);
  });

  it('writes_nothing_to_the_plan', async () => {
    const day = await rows.trip(owner, at(...street(0, 3, 1, 2)));

    await suggest(owner.agent, day.tripId, day.dayId, { keepLast: 'false' });

    const stops = await t.prisma.stop.findMany({
      where: { dayId: day.dayId },
      orderBy: { position: 'asc' },
    });
    const trip = await t.prisma.trip.findUniqueOrThrow({ where: { id: day.tripId } });
    expect(stops.map((stop) => stop.id)).toEqual(day.stopIds);
    expect(trip.planVersion).toBe(0);
  });

  it('routes_only_the_legs_the_cache_lacks', async () => {
    const day = await rows.trip(owner, at(...street(0, 3, 1, 2)));
    await sendRaw(owner.agent, endpoints.getDayRoute, {
      params: { tripId: day.tripId, dayId: day.dayId },
    });
    router.calls.length = 0;

    suggestionOf(await suggest(owner.agent, day.tripId, day.dayId, { keepLast: 'false' }));

    expect(router.calls.map((call) => call.stops.length)).toEqual([2, 2]);
  });

  it('flags_estimated_totals_when_the_provider_is_down', async () => {
    router.failure = new ProviderError('fake', 'timeout', 'slow');
    const day = await rows.trip(owner, at(...street(0, 3, 1, 2)));

    const suggestion = suggestionOf(await suggest(owner.agent, day.tripId, day.dayId));

    expect(suggestion.estimated).toBe(true);
    expect(suggestion.after.distanceMeters).toBeGreaterThan(0);
    expect(await rows.legCacheKeys()).toEqual([]);
  });

  it.each([0, 1, 2])('answers_too_few_stops_for_%i_stops', async (count) => {
    const day = await rows.trip(owner, at(...street(0, 1, 2).slice(0, count)));

    expectProblem(await suggest(owner.agent, day.tripId, day.dayId), 422, 'too_few_stops');
    expect(router.calls).toEqual([]);
  });

  it('suggests_for_exactly_three_stops', async () => {
    const day = await rows.trip(owner, at(...street(0, 2, 1)));

    const suggestion = suggestionOf(
      await suggest(owner.agent, day.tripId, day.dayId, { keepLast: 'false' }),
    );

    const [a, b, c] = day.stopIds;
    expect(suggestion.stopIds).toEqual([a, c, b]);
  });

  it.each([
    [{ keepLast: 'yes' }, '/query/keepLast'],
    [{ order: 'fast' }, '/query/order'],
  ])('rejects_query_%o_with_pointer_%s', async (query, pointer) => {
    const day = await rows.trip(owner, at(...street(0, 1, 2)));

    const problem = expectProblem(
      await suggest(owner.agent, day.tripId, day.dayId, query),
      422,
      'validation_failed',
    );

    expect(problem.errors?.map((error) => error.pointer)).toEqual([pointer]);
  });

  it('answers_unauthenticated_without_a_session', async () => {
    const day = await rows.trip(owner, at(...street(0, 1, 2)));
    const anonymous = request
      .agent(t.app.getHttpServer())
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', t.nextIp());

    expectProblem(await suggest(anonymous, day.tripId, day.dayId), 401, 'unauthenticated');
  });

  it('answers_trip_not_found_to_a_signed_in_viewer_of_a_public_trip', async () => {
    const day = await rows.trip(owner, at(...street(0, 1, 2)));
    await publishTrip(owner.agent, day.tripId);
    const viewer = await createUser(t);

    expectProblem(await suggest(viewer.agent, day.tripId, day.dayId), 404, 'trip_not_found');
    expect(router.calls).toEqual([]);
  });

  it('answers_not_found_for_a_day_of_another_trip', async () => {
    const mine = await rows.trip(owner, at(...street(0, 1, 2)));
    const other = await rows.trip(owner, at(...street(0, 1, 2)));

    expectProblem(await suggest(owner.agent, mine.tripId, other.dayId), 404, 'not_found');
  });
});
