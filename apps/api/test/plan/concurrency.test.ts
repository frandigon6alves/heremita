import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiProblem } from '../../src/core/http/api-problem.js';
import { StopsService } from '../../src/plan/stops.service.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { spareGazetteerKey } from '../support/authz-world.js';
import { addPlace, createTrip, createUser } from '../support/factories.js';
import { expectDensePositions } from './plan-support.js';

// The loops call the service directly: hundreds of writes by one user would
// meet the per-user request throttle, which is not what these tests are about.
// Locking, ordering and conflicts all live below the HTTP layer.

let t: TestApp;
let stops: StopsService;

beforeAll(async () => {
  t = await buildTestApp();
  stops = t.app.get(StopsService);
});

afterAll(async () => {
  await t.close();
});

async function storedStopIds(dayId: string): Promise<string[]> {
  const rows = await t.prisma.stop.findMany({
    where: { dayId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

describe('concurrent plan writes', () => {
  it('serialises_an_add_and_a_stale_full_order_fifty_times', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 3 });
    const idea = await addPlace(owner.agent, plan.trip.id, spareGazetteerKey(1));
    const tripId = plan.trip.id;
    const dayId = plan.days[0]?.id ?? '';
    const userId = owner.user.id;

    for (let round = 0; round < 50; round += 1) {
      const before = await storedStopIds(dayId);

      const [add, order] = await Promise.allSettled([
        stops.add(userId, tripId, dayId, { tripPlaceId: idea.tripPlace.id, index: round % 5 }),
        stops.putOrder(userId, tripId, dayId, { stopIds: [...before].reverse() }),
      ]);

      expect(add.status, `round ${round}`).toBe('fulfilled');
      const added = add.status === 'fulfilled' ? add.value : undefined;
      const after = await storedStopIds(dayId);
      expect(after.toSorted()).toEqual([...before, added?.stop.id].toSorted());
      if (order.status === 'fulfilled') {
        expect(order.value.planVersion, `round ${round}`).toBeLessThan(added?.planVersion ?? 0);
      } else {
        const problem = order.reason as ApiProblem;
        expect(problem).toBeInstanceOf(ApiProblem);
        expect(problem.code).toBe('plan_changed');
        expect(problem.extensions.currentPlanVersion).toBeGreaterThanOrEqual(
          added?.planVersion ?? Infinity,
        );
      }
      await expectDensePositions(t, tripId);
      await stops.delete(userId, tripId, added?.stop.id ?? '');
    }
  });

  it('moves_stops_across_two_days_in_opposite_directions_without_deadlock', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2, stopsPerDay: 3 });
    const [dayA, dayB] = plan.days.map((day) => day.id);
    const userId = owner.user.id;
    const started = performance.now();

    for (let round = 0; round < 20; round += 1) {
      const [fromA] = await storedStopIds(dayA ?? '');
      const [fromB] = await storedStopIds(dayB ?? '');

      const results = await Promise.allSettled([
        stops.putPlacement(userId, plan.trip.id, fromA ?? '', { dayId: dayB ?? '', index: 2 }),
        stops.putPlacement(userId, plan.trip.id, fromB ?? '', { dayId: dayA ?? '', index: 2 }),
      ]);

      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    }

    expect(performance.now() - started).toBeLessThan(5_000);
    expect((await storedStopIds(dayA ?? '')).length).toBe(3);
    expect((await storedStopIds(dayB ?? '')).length).toBe(3);
    await expectDensePositions(t, plan.trip.id);
  });
});
