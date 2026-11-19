import {
  addStopResponseSchema,
  createDayResponseSchema,
  endpoints,
  LIMITS,
} from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GAZETTEER } from '../../src/providers/fake/gazetteer.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { addPlace, createTrip, createUser, type TestUser } from '../support/factories.js';
import { sendRaw } from '../support/http.js';
import { expectDensePositions } from './plan-support.js';

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

/** mulberry32: a small seeded generator, so a failing sequence replays from its seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface ModelDay {
  id: string;
  stops: string[];
}

/** What the plan should look like: days in order, each with its stop ids in visit order. */
class PlanModel {
  constructor(readonly days: ModelDay[]) {}

  dayOfStop(stopId: string): ModelDay | undefined {
    return this.days.find((day) => day.stops.includes(stopId));
  }

  allStops(): string[] {
    return this.days.flatMap((day) => day.stops);
  }
}

/** Fisher–Yates with the seeded generator. */
function shuffle(items: readonly string[], random: () => number): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as string, copy[i] as string];
  }
  return copy;
}

function clampedInsert(list: string[], id: string, index: number): void {
  list.splice(Math.min(index, list.length), 0, id);
}

/** Stop ids per day as stored (read straight from the database: one API call per step keeps under the throttle). */
async function storedOrder(tripId: string): Promise<string[][]> {
  const days = await t.prisma.day.findMany({
    where: { tripId },
    orderBy: { position: 'asc' },
    select: { stops: { orderBy: { position: 'asc' }, select: { id: true } } },
  });
  return days.map((day) => day.stops.map((stop) => stop.id));
}

const OPERATIONS = [
  'addStop',
  'moveStop',
  'reorder',
  'deleteStop',
  'createDay',
  'deleteDay',
] as const;

/**
 * Runs `steps` random plan operations against the API and a model of the plan,
 * asserting after each one that the read plan equals the model and that every
 * day's positions (and the trip's day positions) are dense `0..n−1` (V17).
 */
async function runSequence(owner: TestUser, seed: number, steps: number): Promise<void> {
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const index = (length: number) => Math.floor(random() * (length + 3));

  const plan = await createTrip(owner.agent, { days: 3, stopsPerDay: 2 });
  const tripId = plan.trip.id;
  const ideas = await Promise.all(
    GAZETTEER.slice(-6).map((place) => addPlace(owner.agent, tripId, place.key)),
  );
  const tripPlaceIds = [
    ...plan.places.map((place) => place.id),
    ...ideas.map((idea) => idea.tripPlace.id),
  ];
  const model = new PlanModel(
    plan.days.map((day) => ({ id: day.id, stops: day.stops.map((stop) => stop.id) })),
  );

  for (let step = 0; step < steps; step += 1) {
    const operation = pick(OPERATIONS);
    const context = `seed ${seed}, step ${step}, ${operation}`;
    const stops = model.allStops();

    if (operation === 'addStop' && model.days.length > 0) {
      const day = pick(model.days);
      const at = index(day.stops.length);
      const response = await sendRaw(owner.agent, endpoints.addStop, {
        params: { tripId, dayId: day.id },
        body: { tripPlaceId: pick(tripPlaceIds), index: at },
      });
      if (day.stops.length >= LIMITS.STOPS_PER_DAY) {
        expect(response.status, context).toBe(409);
      } else {
        expect(response.status, context).toBe(201);
        clampedInsert(day.stops, addStopResponseSchema.parse(response.body).stop.id, at);
      }
    } else if (operation === 'moveStop' && stops.length > 0) {
      const stopId = pick(stops);
      const from = model.dayOfStop(stopId) as ModelDay;
      const to = pick(model.days);
      const at = index(to.stops.length);
      const response = await sendRaw(owner.agent, endpoints.putStopPlacement, {
        params: { tripId, stopId },
        body: { dayId: to.id, index: at },
      });
      if (from !== to && to.stops.length >= LIMITS.STOPS_PER_DAY) {
        expect(response.status, context).toBe(409);
      } else {
        expect(response.status, context).toBe(200);
        from.stops.splice(from.stops.indexOf(stopId), 1);
        clampedInsert(to.stops, stopId, at);
      }
    } else if (operation === 'reorder' && model.days.length > 0) {
      const day = pick(model.days);
      const order = shuffle(day.stops, random);
      const response = await sendRaw(owner.agent, endpoints.putStopOrder, {
        params: { tripId, dayId: day.id },
        body: { stopIds: order },
      });
      expect(response.status, context).toBe(200);
      day.stops = order;
    } else if (operation === 'deleteStop' && stops.length > 0) {
      const stopId = pick(stops);
      const response = await sendRaw(owner.agent, endpoints.deleteStop, {
        params: { tripId, stopId },
      });
      expect(response.status, context).toBe(200);
      const day = model.dayOfStop(stopId) as ModelDay;
      day.stops.splice(day.stops.indexOf(stopId), 1);
    } else if (operation === 'createDay') {
      const at = index(model.days.length);
      const response = await sendRaw(owner.agent, endpoints.createDay, {
        params: { tripId },
        body: { index: at },
      });
      expect(response.status, context).toBe(201);
      const { day } = createDayResponseSchema.parse(response.body);
      model.days.splice(Math.min(at, model.days.length), 0, { id: day.id, stops: [] });
    } else if (operation === 'deleteDay' && model.days.length > 1) {
      const day = pick(model.days);
      const response = await sendRaw(owner.agent, endpoints.deleteDay, {
        params: { tripId, dayId: day.id },
      });
      expect(response.status, context).toBe(200);
      model.days.splice(model.days.indexOf(day), 1);
    }

    expect(await storedOrder(tripId), context).toEqual(model.days.map((day) => day.stops));
    await expectDensePositions(t, tripId);
  }
}

describe('plan order (V17)', () => {
  // 240 requests in a row: about 1.5 s on a laptop, over 5 s on a CI runner.
  it('keeps_positions_dense_through_random_operation_sequences', { timeout: 30_000 }, async () => {
    for (const seed of [1, 7, 2026]) {
      await runSequence(await createUser(t), seed, 80);
    }
  });
});
