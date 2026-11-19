import { createDayResponseSchema, endpoints, LIMITS } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../support/app.js';
import { snapshotTrip } from '../support/authz-world.js';
import { createTrip, createUser, getPlan } from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';
import {
  anonymous,
  dayIdsOf,
  expectDensePositions,
  expectProblem,
  planVersionOf,
  UNKNOWN_ID,
} from './plan-support.js';

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('E32 createDay', () => {
  it('appends_an_empty_day_in_the_trip_mode_and_dates_it', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2 });
    await callOk(owner.agent, 'updateTrip', {
      params: { tripId: plan.trip.id },
      body: { startDate: '2027-03-01', defaultMode: 'drive' },
    });
    const version = await planVersionOf(t, plan.trip.id);

    const response = await sendRaw(owner.agent, endpoints.createDay, {
      params: { tripId: plan.trip.id },
      body: {},
    });

    expect(response.status).toBe(201);
    const created = createDayResponseSchema.parse(response.body);
    expect(response.headers.location).toBe(`/api/v1/trips/${plan.trip.id}/days/${created.day.id}`);
    expect(created).toEqual({
      day: {
        id: created.day.id,
        number: 3,
        date: '2027-03-03',
        mode: 'drive',
        modeOverride: null,
        stops: [],
      },
      planVersion: version + 1,
    });
    expect(dayIdsOf(await getPlan(owner.agent, plan.trip.id))).toEqual([
      ...dayIdsOf(plan),
      created.day.id,
    ]);
  });

  it('inserts_at_the_start_and_moves_later_days_with_their_stops', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2, stopsPerDay: 2 });

    const created = await callOk(owner.agent, 'createDay', {
      params: { tripId: plan.trip.id },
      body: { index: 0 },
    });

    const read = await getPlan(owner.agent, plan.trip.id);
    expect(created.day.number).toBe(1);
    expect(dayIdsOf(read)).toEqual([created.day.id, ...dayIdsOf(plan)]);
    expect(read.days.map((day) => day.stops)).toEqual([[], ...plan.days.map((day) => day.stops)]);
    await expectDensePositions(t, plan.trip.id);
  });

  it('inserts_in_the_middle_and_clamps_an_index_past_the_end', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2 });

    const middle = await callOk(owner.agent, 'createDay', {
      params: { tripId: plan.trip.id },
      body: { index: 1 },
    });
    const end = await callOk(owner.agent, 'createDay', {
      params: { tripId: plan.trip.id },
      body: { index: 40 },
    });

    const [first, second] = dayIdsOf(plan);
    expect(dayIdsOf(await getPlan(owner.agent, plan.trip.id))).toEqual([
      first,
      middle.day.id,
      second,
      end.day.id,
    ]);
    expect(end.day.number).toBe(4);
    await expectDensePositions(t, plan.trip.id);
  });

  it('accepts_the_60th_day_and_refuses_the_61st', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: LIMITS.DAYS_PER_TRIP - 1 });

    const last = await sendRaw(owner.agent, endpoints.createDay, {
      params: { tripId: plan.trip.id },
      body: {},
    });
    const before = await snapshotTrip(t, plan.trip.id);
    const over = await sendRaw(owner.agent, endpoints.createDay, {
      params: { tripId: plan.trip.id },
      body: { index: 0 },
    });

    expect(last.status).toBe(201);
    expect(createDayResponseSchema.parse(last.body).day.number).toBe(LIMITS.DAYS_PER_TRIP);
    expectProblem(over, 409, 'limit_reached');
    expect(await snapshotTrip(t, plan.trip.id)).toEqual(before);
  });

  it('answers_422_with_a_pointer_for_a_negative_index', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent);

    const response = await sendRaw(owner.agent, endpoints.createDay, {
      params: { tripId: plan.trip.id },
      body: { index: -1 },
    });

    const problem = expectProblem(response, 422, 'validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/body/index']);
  });

  it('answers_404_for_another_users_trip_and_401_without_a_session', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const plan = await createTrip(owner.agent);

    expectProblem(
      await sendRaw(stranger.agent, endpoints.createDay, {
        params: { tripId: plan.trip.id },
        body: {},
      }),
      404,
      'trip_not_found',
    );
    expectProblem(
      await sendRaw(anonymous(t), endpoints.createDay, {
        params: { tripId: plan.trip.id },
        body: {},
      }),
      401,
      'unauthenticated',
    );
    expect(await planVersionOf(t, plan.trip.id)).toBe(plan.planVersion);
  });
});

describe('E33 updateDay', () => {
  it('overrides_the_day_mode_and_clears_it_again', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2 });
    const [dayId, otherDayId] = dayIdsOf(plan);

    const set = await callOk(owner.agent, 'updateDay', {
      params: { tripId: plan.trip.id, dayId: dayId ?? '' },
      body: { modeOverride: 'bike' },
    });
    const afterSet = await getPlan(owner.agent, plan.trip.id);
    const cleared = await callOk(owner.agent, 'updateDay', {
      params: { tripId: plan.trip.id, dayId: dayId ?? '' },
      body: { modeOverride: null },
    });
    const afterClear = await getPlan(owner.agent, plan.trip.id);

    expect(set.planVersion).toBe(plan.planVersion + 1);
    expect(cleared.planVersion).toBe(plan.planVersion + 2);
    expect(afterSet.days.map((day) => [day.id, day.mode, day.modeOverride])).toEqual([
      [dayId, 'bike', 'bike'],
      [otherDayId, 'walk', null],
    ]);
    expect(afterClear.days[0]).toMatchObject({ mode: 'walk', modeOverride: null });
  });

  it('answers_422_with_a_pointer_for_an_unknown_mode', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent);

    const response = await sendRaw(owner.agent, endpoints.updateDay, {
      params: { tripId: plan.trip.id, dayId: dayIdsOf(plan)[0] ?? '' },
      body: { modeOverride: 'swim' },
    });

    const problem = expectProblem(response, 422, 'validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/body/modeOverride']);
  });

  it('answers_404_for_a_day_of_another_trip_or_an_unknown_day_and_changes_nothing', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const [mine, theirs] = await Promise.all([createTrip(owner.agent), createTrip(stranger.agent)]);
    const theirDay = dayIdsOf(theirs)[0] ?? '';
    const before = await snapshotTrip(t, theirs.trip.id);

    for (const dayId of [theirDay, UNKNOWN_ID]) {
      const response = await sendRaw(owner.agent, endpoints.updateDay, {
        params: { tripId: mine.trip.id, dayId },
        body: { modeOverride: 'drive' },
      });

      expectProblem(response, 404, 'not_found');
    }
    expectProblem(
      await sendRaw(owner.agent, endpoints.updateDay, {
        params: { tripId: theirs.trip.id, dayId: theirDay },
        body: { modeOverride: 'drive' },
      }),
      404,
      'trip_not_found',
    );
    expect(await snapshotTrip(t, theirs.trip.id)).toEqual(before);
    expect(await planVersionOf(t, mine.trip.id)).toBe(mine.planVersion);
  });
});

describe('E34 deleteDay', () => {
  it('drops_its_stops_keeps_their_places_as_ideas_and_renumbers_later_days', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 3, stopsPerDay: 2 });
    const [first, second, third] = plan.days;
    if (!first || !second || !third) {
      throw new Error('The trip needs three days');
    }

    const change = await callOk(owner.agent, 'deleteDay', {
      params: { tripId: plan.trip.id, dayId: second.id },
    });

    const read = await getPlan(owner.agent, plan.trip.id);
    expect(change.planVersion).toBe(plan.planVersion + 1);
    expect(read.days.map((day) => [day.id, day.number])).toEqual([
      [first.id, 1],
      [third.id, 2],
    ]);
    expect(read.days[1]?.stops).toEqual(third.stops);
    expect(read.places.map((place) => place.id)).toEqual(plan.places.map((place) => place.id));
    const scheduled = new Set(
      read.days.flatMap((day) => day.stops.map((stop) => stop.tripPlaceId)),
    );
    expect(second.stops.every((stop) => !scheduled.has(stop.tripPlaceId))).toBe(true);
    expect(await t.prisma.stop.count({ where: { dayId: second.id } })).toBe(0);
    await expectDensePositions(t, plan.trip.id);
  });

  it('can_leave_a_trip_without_days', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 1 });

    await callOk(owner.agent, 'deleteDay', {
      params: { tripId: plan.trip.id, dayId: dayIdsOf(plan)[0] ?? '' },
    });

    const read = await getPlan(owner.agent, plan.trip.id);
    expect(read.days).toEqual([]);
    expect(read.places).toHaveLength(1);
  });

  it('answers_404_once_deleted_and_for_a_day_of_another_trip', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const [mine, theirs] = await Promise.all([
      createTrip(owner.agent, { days: 2 }),
      createTrip(stranger.agent),
    ]);
    const deleted = dayIdsOf(mine)[0] ?? '';
    await callOk(owner.agent, 'deleteDay', { params: { tripId: mine.trip.id, dayId: deleted } });

    for (const dayId of [deleted, dayIdsOf(theirs)[0] ?? '']) {
      const response = await sendRaw(owner.agent, endpoints.deleteDay, {
        params: { tripId: mine.trip.id, dayId },
      });

      expectProblem(response, 404, 'not_found');
    }
    expect(await t.prisma.day.count({ where: { tripId: theirs.trip.id } })).toBe(1);
  });
});
