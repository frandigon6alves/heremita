import { endpoints, problemDetailsSchema } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../support/app.js';
import { createTrip, createUser, getPlan } from '../support/factories.js';
import { sendRaw } from '../support/http.js';
import { expectDensePositions } from '../plan/plan-support.js';

/**
 * A UUID is case-insensitive (RFC 9562 §4): PostgreSQL reads `0198A…` and
 * `0198a…` as the same id, so the API must too. Services compare ids in
 * JavaScript, where they are plain strings.
 */
let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('ids sent in upper case', () => {
  it('moves_a_stop_within_its_own_day_when_the_day_id_is_upper_case (V17)', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 3 });
    const day = plan.days[0]!;
    const [first, second, third] = day.stops.map((stop) => stop.id);

    const response = await sendRaw(owner.agent, endpoints.putStopPlacement, {
      params: { tripId: plan.trip.id, stopId: second! },
      body: { dayId: day.id.toUpperCase(), index: 0 },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const after = await getPlan(owner.agent, plan.trip.id);
    expect(after.days[0]!.stops.map((stop) => stop.id)).toEqual([second, first, third]);
    await expectDensePositions(t, plan.trip.id);
  });

  it('refuses_to_block_oneself_by_an_upper_case_id', async () => {
    const user = await createUser(t);

    const response = await sendRaw(user.agent, endpoints.blockUser, {
      params: { userId: user.user.id.toUpperCase() },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(problemDetailsSchema.parse(response.body).code).toBe('cannot_block_self');
  });
});
