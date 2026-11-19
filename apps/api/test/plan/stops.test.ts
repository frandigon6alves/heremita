import { addStopResponseSchema, endpoints, LIMITS, type TripPlanOwner } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../support/app.js';
import { snapshotTrip, spareGazetteerKey } from '../support/authz-world.js';
import { addPlace, createTrip, createUser, getPlan, type TestUser } from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';
import {
  anonymous,
  expectDensePositions,
  expectProblem,
  fillDay,
  planVersionOf,
  stopIdsByDay,
  UNKNOWN_ID,
} from './plan-support.js';

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

function dayOf(plan: TripPlanOwner, index = 0) {
  const day = plan.days[index];
  if (!day) {
    throw new Error(`The trip has no day ${index}`);
  }
  return day;
}

function stopIds(plan: TripPlanOwner, dayIndex = 0): string[] {
  return dayOf(plan, dayIndex).stops.map((stop) => stop.id);
}

/** A trip with `stopsPerDay` stops on each of `days` days and one idea; returns the plan and the idea. */
async function tripWithIdea(owner: TestUser, days: number, stopsPerDay: number) {
  const plan = await createTrip(owner.agent, { days, stopsPerDay });
  const idea = await addPlace(owner.agent, plan.trip.id, spareGazetteerKey(1));
  return { plan: await getPlan(owner.agent, plan.trip.id), ideaId: idea.tripPlace.id };
}

function rotations(ids: readonly string[]): string[][] {
  return ids.map((_, shift) => [...ids.slice(shift), ...ids.slice(0, shift)]);
}

describe('E35 addStop', () => {
  it('appends_a_trip_place_to_a_day_without_an_index', async () => {
    const owner = await createUser(t);
    const { plan, ideaId } = await tripWithIdea(owner, 1, 2);

    const response = await sendRaw(owner.agent, endpoints.addStop, {
      params: { tripId: plan.trip.id, dayId: dayOf(plan).id },
      body: { tripPlaceId: ideaId },
    });

    expect(response.status).toBe(201);
    const added = addStopResponseSchema.parse(response.body);
    expect(response.headers.location).toBe(`/api/v1/trips/${plan.trip.id}/stops/${added.stop.id}`);
    expect(added).toEqual({
      stop: { id: added.stop.id, tripPlaceId: ideaId, modeToNext: null },
      planVersion: plan.planVersion + 1,
    });
    expect((await stopIdsByDay(owner.agent, plan.trip.id))[0]).toEqual([
      ...stopIds(plan),
      added.stop.id,
    ]);
  });

  it('inserts_at_the_start_the_middle_and_a_clamped_end', async () => {
    const owner = await createUser(t);
    const { plan, ideaId } = await tripWithIdea(owner, 1, 2);
    const add = (index: number) =>
      callOk(owner.agent, 'addStop', {
        params: { tripId: plan.trip.id, dayId: dayOf(plan).id },
        body: { tripPlaceId: ideaId, index },
      });

    const start = await add(0);
    const middle = await add(2);
    const end = await add(99);

    const [a, b] = stopIds(plan);
    expect((await stopIdsByDay(owner.agent, plan.trip.id))[0]).toEqual([
      start.stop.id,
      a,
      middle.stop.id,
      b,
      end.stop.id,
    ]);
    await expectDensePositions(t, plan.trip.id);
  });

  it('puts_one_trip_place_on_several_days', async () => {
    const owner = await createUser(t);
    const { plan, ideaId } = await tripWithIdea(owner, 2, 1);

    for (const day of plan.days) {
      await callOk(owner.agent, 'addStop', {
        params: { tripId: plan.trip.id, dayId: day.id },
        body: { tripPlaceId: ideaId },
      });
    }

    const read = await getPlan(owner.agent, plan.trip.id);
    expect(read.days.map((day) => day.stops.at(-1)?.tripPlaceId)).toEqual([ideaId, ideaId]);
  });

  it('accepts_the_25th_stop_and_refuses_the_26th', async () => {
    const owner = await createUser(t);
    const { plan, ideaId } = await tripWithIdea(owner, 1, 0);
    const dayId = dayOf(plan).id;
    await fillDay(t, plan.trip.id, dayId, LIMITS.STOPS_PER_DAY - 1);

    const last = await sendRaw(owner.agent, endpoints.addStop, {
      params: { tripId: plan.trip.id, dayId },
      body: { tripPlaceId: ideaId, index: 0 },
    });
    const before = await snapshotTrip(t, plan.trip.id);
    const over = await sendRaw(owner.agent, endpoints.addStop, {
      params: { tripId: plan.trip.id, dayId },
      body: { tripPlaceId: ideaId },
    });

    expect(last.status).toBe(201);
    expectProblem(over, 409, 'day_full');
    expect(await snapshotTrip(t, plan.trip.id)).toEqual(before);
    await expectDensePositions(t, plan.trip.id);
  });

  it('answers_404_for_a_trip_place_or_day_of_another_trip', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const mine = await tripWithIdea(owner, 1, 0);
    const theirs = await tripWithIdea(stranger, 1, 0);

    const cases = [
      { dayId: dayOf(mine.plan).id, tripPlaceId: theirs.ideaId },
      { dayId: dayOf(theirs.plan).id, tripPlaceId: mine.ideaId },
      { dayId: UNKNOWN_ID, tripPlaceId: mine.ideaId },
      { dayId: dayOf(mine.plan).id, tripPlaceId: UNKNOWN_ID },
    ];
    for (const { dayId, tripPlaceId } of cases) {
      const response = await sendRaw(owner.agent, endpoints.addStop, {
        params: { tripId: mine.plan.trip.id, dayId },
        body: { tripPlaceId },
      });

      expectProblem(response, 404, 'not_found');
    }
    expect(await t.prisma.stop.count({ where: { tripId: theirs.plan.trip.id } })).toBe(0);
    expect(await planVersionOf(t, mine.plan.trip.id)).toBe(mine.plan.planVersion);
  });

  it('answers_404_for_another_users_trip_401_without_a_session_and_422_without_a_trip_place', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const { plan, ideaId } = await tripWithIdea(owner, 1, 0);
    const params = { tripId: plan.trip.id, dayId: dayOf(plan).id };

    expectProblem(
      await sendRaw(stranger.agent, endpoints.addStop, { params, body: { tripPlaceId: ideaId } }),
      404,
      'trip_not_found',
    );
    expectProblem(
      await sendRaw(anonymous(t), endpoints.addStop, { params, body: { tripPlaceId: ideaId } }),
      401,
      'unauthenticated',
    );
    const invalid = expectProblem(
      await sendRaw(owner.agent, endpoints.addStop, { params, body: {} }),
      422,
      'validation_failed',
    );
    expect(invalid.errors?.map((error) => error.pointer)).toEqual(['/body/tripPlaceId']);
  });
});

describe('E36 putStopOrder', () => {
  it('applies_every_rotation_and_the_reverse_of_a_five_stop_day', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 5 });
    const original = stopIds(plan);
    const params = { tripId: plan.trip.id, dayId: dayOf(plan).id };

    for (const order of [...rotations(original), [...original].reverse()]) {
      const before = await planVersionOf(t, plan.trip.id);

      const change = await callOk(owner.agent, 'putStopOrder', {
        params,
        body: { stopIds: order },
      });

      expect(change.planVersion).toBe(before + 1);
      expect((await stopIdsByDay(owner.agent, plan.trip.id))[0]).toEqual(order);
      await expectDensePositions(t, plan.trip.id);
    }
  });

  it('accepts_the_empty_order_of_an_empty_day', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1 });

    const change = await callOk(owner.agent, 'putStopOrder', {
      params: { tripId: plan.trip.id, dayId: dayOf(plan).id },
      body: { stopIds: [] },
    });

    expect(change.planVersion).toBe(plan.planVersion + 1);
  });

  it('answers_409_plan_changed_for_a_list_that_is_not_the_days_stops_and_writes_nothing', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2, stopsPerDay: 3 });
    const params = { tripId: plan.trip.id, dayId: dayOf(plan).id };
    const [a, b, c] = stopIds(plan);
    const foreign = stopIds(plan, 1)[0] ?? '';
    const before = await snapshotTrip(t, plan.trip.id);

    for (const order of [
      [a, b],
      [a, b, c, foreign],
      [a, b, foreign],
      [c, b, UNKNOWN_ID],
    ]) {
      const response = await sendRaw(owner.agent, endpoints.putStopOrder, {
        params,
        body: { stopIds: order },
      });

      const problem = expectProblem(response, 409, 'plan_changed');
      expect(problem.currentPlanVersion).toBe(plan.planVersion);
    }
    expect(await snapshotTrip(t, plan.trip.id)).toEqual(before);
  });

  it('answers_422_with_a_pointer_for_duplicate_ids', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 2 });
    const [a, b] = stopIds(plan);

    const response = await sendRaw(owner.agent, endpoints.putStopOrder, {
      params: { tripId: plan.trip.id, dayId: dayOf(plan).id },
      body: { stopIds: [a, b, a] },
    });

    const problem = expectProblem(response, 422, 'validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/body/stopIds']);
  });

  it('answers_404_for_a_day_of_another_trip', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const [mine, theirs] = await Promise.all([
      createTrip(owner.agent),
      createTrip(stranger.agent, { days: 1, stopsPerDay: 2 }),
    ]);

    const response = await sendRaw(owner.agent, endpoints.putStopOrder, {
      params: { tripId: mine.trip.id, dayId: dayOf(theirs).id },
      body: { stopIds: [...stopIds(theirs)].reverse() },
    });

    expectProblem(response, 404, 'not_found');
    expect((await stopIdsByDay(stranger.agent, theirs.trip.id))[0]).toEqual(stopIds(theirs));
  });
});

describe('E37 putStopPlacement', () => {
  it('moves_a_stop_within_its_day_to_the_start_and_to_a_clamped_end', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 4 });
    const [a, b, c, d] = stopIds(plan);
    const move = (stopId: string | undefined, index: number) =>
      callOk(owner.agent, 'putStopPlacement', {
        params: { tripId: plan.trip.id, stopId: stopId ?? '' },
        body: { dayId: dayOf(plan).id, index },
      });

    await move(c, 0);
    const afterStart = (await stopIdsByDay(owner.agent, plan.trip.id))[0];
    const change = await move(c, 99);
    const afterEnd = (await stopIdsByDay(owner.agent, plan.trip.id))[0];

    expect(afterStart).toEqual([c, a, b, d]);
    expect(afterEnd).toEqual([a, b, d, c]);
    expect(change.planVersion).toBe(plan.planVersion + 2);
    await expectDensePositions(t, plan.trip.id);
  });

  it('moves_a_stop_to_another_day_and_closes_up_its_old_day', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2, stopsPerDay: 3 });
    const [a, b, c] = stopIds(plan, 0);
    const [x, y, z] = stopIds(plan, 1);

    await callOk(owner.agent, 'putStopPlacement', {
      params: { tripId: plan.trip.id, stopId: b ?? '' },
      body: { dayId: dayOf(plan, 1).id, index: 1 },
    });

    expect(await stopIdsByDay(owner.agent, plan.trip.id)).toEqual([
      [a, c],
      [x, b, y, z],
    ]);
    await expectDensePositions(t, plan.trip.id);
  });

  it('moves_within_a_full_day_but_refuses_a_full_other_day', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2, stopsPerDay: 1 });
    const fullDayId = dayOf(plan, 1).id;
    await fillDay(t, plan.trip.id, fullDayId, LIMITS.STOPS_PER_DAY - 1);
    const full = (await stopIdsByDay(owner.agent, plan.trip.id))[1] ?? [];

    const within = await sendRaw(owner.agent, endpoints.putStopPlacement, {
      params: { tripId: plan.trip.id, stopId: full.at(-1) ?? '' },
      body: { dayId: fullDayId, index: 0 },
    });
    const before = await snapshotTrip(t, plan.trip.id);
    const into = await sendRaw(owner.agent, endpoints.putStopPlacement, {
      params: { tripId: plan.trip.id, stopId: stopIds(plan, 0)[0] ?? '' },
      body: { dayId: fullDayId, index: 0 },
    });

    expect(within.status).toBe(200);
    expectProblem(into, 409, 'day_full');
    expect(await snapshotTrip(t, plan.trip.id)).toEqual(before);
  });

  it('answers_404_for_a_stop_or_target_day_of_another_trip', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const [mine, theirs] = await Promise.all([
      createTrip(owner.agent, { days: 1, stopsPerDay: 1 }),
      createTrip(stranger.agent, { days: 1, stopsPerDay: 1 }),
    ]);
    const theirsBefore = await snapshotTrip(t, theirs.trip.id);

    for (const [stopId, dayId] of [
      [stopIds(theirs)[0], dayOf(mine).id],
      [stopIds(mine)[0], dayOf(theirs).id],
      [UNKNOWN_ID, dayOf(mine).id],
    ]) {
      const response = await sendRaw(owner.agent, endpoints.putStopPlacement, {
        params: { tripId: mine.trip.id, stopId: stopId ?? '' },
        body: { dayId: dayId ?? '', index: 0 },
      });

      expectProblem(response, 404, 'not_found');
    }
    expect(await snapshotTrip(t, theirs.trip.id)).toEqual(theirsBefore);
  });
});

describe('E38 updateStop', () => {
  it('sets_and_clears_the_mode_of_the_leg_leaving_a_stop', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 2 });
    const params = { tripId: plan.trip.id, stopId: stopIds(plan)[0] ?? '' };

    const set = await callOk(owner.agent, 'updateStop', { params, body: { modeToNext: 'drive' } });
    const afterSet = await getPlan(owner.agent, plan.trip.id);
    const cleared = await callOk(owner.agent, 'updateStop', { params, body: { modeToNext: null } });

    expect(set.planVersion).toBe(plan.planVersion + 1);
    expect(cleared.planVersion).toBe(plan.planVersion + 2);
    expect(dayOf(afterSet).stops[0]?.modeToNext).toBe('drive');
    expect(dayOf(await getPlan(owner.agent, plan.trip.id)).stops[0]?.modeToNext).toBeNull();
  });

  it('answers_404_for_a_stop_of_another_trip_and_422_for_an_unknown_mode', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const [mine, theirs] = await Promise.all([
      createTrip(owner.agent, { days: 1, stopsPerDay: 1 }),
      createTrip(stranger.agent, { days: 1, stopsPerDay: 1 }),
    ]);

    expectProblem(
      await sendRaw(owner.agent, endpoints.updateStop, {
        params: { tripId: mine.trip.id, stopId: stopIds(theirs)[0] ?? '' },
        body: { modeToNext: 'bike' },
      }),
      404,
      'not_found',
    );
    const invalid = expectProblem(
      await sendRaw(owner.agent, endpoints.updateStop, {
        params: { tripId: mine.trip.id, stopId: stopIds(mine)[0] ?? '' },
        body: { modeToNext: 'fly' },
      }),
      422,
      'validation_failed',
    );
    expect(invalid.errors?.map((error) => error.pointer)).toEqual(['/body/modeToNext']);
    const theirStop = await t.prisma.stop.findUniqueOrThrow({ where: { id: stopIds(theirs)[0] } });
    expect(theirStop.modeToNext).toBeNull();
  });
});

describe('E39 deleteStop', () => {
  it('removes_the_stop_closes_up_the_day_and_keeps_the_trip_place_as_an_idea', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 3 });
    const [a, b, c] = dayOf(plan).stops;

    const change = await callOk(owner.agent, 'deleteStop', {
      params: { tripId: plan.trip.id, stopId: b?.id ?? '' },
    });

    const read = await getPlan(owner.agent, plan.trip.id);
    expect(change.planVersion).toBe(plan.planVersion + 1);
    expect(stopIds(read)).toEqual([a?.id, c?.id]);
    expect(read.places.map((place) => place.id)).toContain(b?.tripPlaceId);
    await expectDensePositions(t, plan.trip.id);
  });

  it('answers_404_once_deleted_and_for_a_stop_of_another_trip', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const [mine, theirs] = await Promise.all([
      createTrip(owner.agent, { days: 1, stopsPerDay: 1 }),
      createTrip(stranger.agent, { days: 1, stopsPerDay: 1 }),
    ]);
    const deleted = stopIds(mine)[0] ?? '';
    await callOk(owner.agent, 'deleteStop', { params: { tripId: mine.trip.id, stopId: deleted } });

    for (const stopId of [deleted, stopIds(theirs)[0] ?? '']) {
      const response = await sendRaw(owner.agent, endpoints.deleteStop, {
        params: { tripId: mine.trip.id, stopId },
      });

      expectProblem(response, 404, 'not_found');
    }
    expect(await t.prisma.stop.count({ where: { tripId: theirs.trip.id } })).toBe(1);
  });
});
