import { problemDetailsSchema, type ErrorCode, type TripPlanOwner } from '@heremita/shared';
import request from 'supertest';
import { expect } from 'vitest';
import { WEB_ORIGIN, type TestApp } from '../support/app.js';
import { getPlan, type TestAgent } from '../support/factories.js';

/** An id no row has. */
export const UNKNOWN_ID = '0190d3a4-0000-7000-8000-000000000000';

/** A client without a session that passes the CSRF check, so a missing session answers 401. */
export function anonymous(t: TestApp): TestAgent {
  return request
    .agent(t.app.getHttpServer())
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', t.nextIp());
}

export async function planVersionOf(t: TestApp, tripId: string): Promise<number> {
  const trip = await t.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  return trip.planVersion;
}

/** Asserts an error answer: status, problem body and code. */
export function expectProblem(
  response: request.Response,
  status: number,
  code: ErrorCode,
): ReturnType<typeof problemDetailsSchema.parse> {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  const problem = problemDetailsSchema.parse(response.body);
  expect(problem.code).toBe(code);
  return problem;
}

/** Stop ids per day, in day order then visit order, as the plan read reports them. */
export async function stopIdsByDay(agent: TestAgent, tripId: string): Promise<string[][]> {
  const plan = await getPlan(agent, tripId);
  return plan.days.map((day) => day.stops.map((stop) => stop.id));
}

/** V17: every day's stop positions and the trip's day positions are exactly `0..n−1` in the database. */
export async function expectDensePositions(t: TestApp, tripId: string): Promise<void> {
  const days = await t.prisma.day.findMany({
    where: { tripId },
    orderBy: { position: 'asc' },
    select: { position: true, stops: { orderBy: { position: 'asc' }, select: { position: true } } },
  });
  expect(days.map((day) => day.position)).toEqual(days.map((_, index) => index));
  for (const day of days) {
    expect(day.stops.map((stop) => stop.position)).toEqual(day.stops.map((_, index) => index));
  }
}

/** The plan with the day ids, for tests that address days by order. */
export function dayIdsOf(plan: TripPlanOwner): string[] {
  return plan.days.map((day) => day.id);
}

/** Adds `count` custom pins to a trip straight in the database (fast limit setups); returns their trip place ids. */
export async function fillTripPlaces(t: TestApp, tripId: string, count: number): Promise<string[]> {
  const rows = await t.prisma.$queryRaw<{ id: string }[]>`
    WITH pins AS (
      INSERT INTO places (source, trip_id, name, category, lng, lat, updated_at)
      SELECT 'custom', ${tripId}::uuid, 'Pin ' || g, 'other', 0, 0, now()
      FROM generate_series(1, ${count}::int) AS g
      RETURNING id
    )
    INSERT INTO trip_places (trip_id, place_id, updated_at)
    SELECT ${tripId}::uuid, id, now() FROM pins
    RETURNING id::text AS id`;
  return rows.map((row) => row.id);
}

/** Appends `count` new stops (on new custom pins) to a day straight in the database. */
export async function fillDay(
  t: TestApp,
  tripId: string,
  dayId: string,
  count: number,
): Promise<void> {
  const tripPlaceIds = await fillTripPlaces(t, tripId, count);
  const taken = await t.prisma.stop.count({ where: { dayId } });
  await t.prisma.stop.createMany({
    data: tripPlaceIds.map((tripPlaceId, index) => ({
      tripId,
      dayId,
      tripPlaceId,
      position: taken + index,
    })),
  });
}
