import type { LngLat } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_EXACT_FREE_STOPS,
  optimiseOrder,
  pathCost,
  straightLineMatrix,
  type CostMatrix,
} from './optimise.js';

/** Seeded PRNG (mulberry32): same seed, same matrices. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomPoints(random: () => number, n: number): LngLat[] {
  return Array.from({ length: n }, () => ({
    lng: -9.2 + random() * 0.1,
    lat: 38.7 + random() * 0.05,
  }));
}

function permutations(items: readonly number[]): number[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

function bruteForceCost(cost: CostMatrix, keepLast: boolean): number {
  const n = cost.length;
  const free = Array.from({ length: n - 1 }, (_, i) => i + 1).filter(
    (stop) => !keepLast || stop !== n - 1,
  );
  return Math.min(
    ...permutations(free).map((middle) =>
      pathCost(cost, [0, ...middle, ...(keepLast ? [n - 1] : [])]),
    ),
  );
}

/** `n` points on a circle around Lisbon, listed in `listing` order. */
function circle(n: number, listing: readonly number[]): LngLat[] {
  return listing.map((step) => ({
    lng: -9.14 + 0.01 * Math.cos((2 * Math.PI * step) / n),
    lat: 38.71 + 0.01 * Math.sin((2 * Math.PI * step) / n),
  }));
}

/** Points along one street, listed in `listing` order (value = distance from the start). */
function street(listing: readonly number[]): LngLat[] {
  return listing.map((step) => ({ lng: -9.14 + step * 0.001, lat: 38.71 }));
}

describe('optimiseOrder', () => {
  it.each([0, 1, 2])('keeps_the_order_of_%i_stops', (n) => {
    const cost = straightLineMatrix(street([0, 5].slice(0, n)));

    expect(optimiseOrder(cost, { keepLast: false })).toEqual([...Array(n).keys()]);
  });

  it('visits_stops_along_one_street_in_street_order', () => {
    const order = optimiseOrder(straightLineMatrix(street([0, 5, 1, 4, 2, 3])), {
      keepLast: false,
    });

    expect(order).toEqual([0, 2, 4, 5, 3, 1]);
  });

  it('keeps_the_last_stop_last_when_asked', () => {
    const order = optimiseOrder(straightLineMatrix(street([0, 3, 1, 2, 4])), { keepLast: true });

    expect(order).toEqual([0, 2, 3, 1, 4]);
  });

  it('moves_the_last_stop_when_the_end_is_free', () => {
    const order = optimiseOrder(straightLineMatrix(street([0, 4, 1, 3, 2])), { keepLast: false });

    expect(order).toEqual([0, 2, 4, 3, 1]);
    expect(
      optimiseOrder(straightLineMatrix(street([0, 4, 1, 3, 2])), { keepLast: true }).at(-1),
    ).toBe(4);
    expect(optimiseOrder(straightLineMatrix(street([0, 3, 1, 4, 2])), { keepLast: false })).toEqual(
      [0, 2, 4, 1, 3],
    );
  });

  it.each([false, true])('finds_the_optimum_of_random_days_with_keepLast_%s', (keepLast) => {
    const random = seeded(42);
    for (let n = 3; n <= 8; n += 1) {
      for (let sample = 0; sample < 5; sample += 1) {
        const cost = straightLineMatrix(randomPoints(random, n));

        const order = optimiseOrder(cost, { keepLast });

        expect(pathCost(cost, order)).toBeCloseTo(bruteForceCost(cost, keepLast), 6);
      }
    }
  });

  it('solves_an_asymmetric_matrix_exactly', () => {
    const cost: CostMatrix = [
      [0, 1, 10, 10],
      [10, 0, 1, 10],
      [10, 10, 0, 1],
      [1, 10, 10, 0],
    ];

    expect(optimiseOrder(cost, { keepLast: false })).toEqual([0, 1, 2, 3]);
  });

  it('goes_round_a_shuffled_circle_with_the_exact_solver', () => {
    const listing = [0, 7, 3, 11, 1, 9, 5, 12, 2, 10, 6, 4, 8];

    const order = optimiseOrder(straightLineMatrix(circle(13, listing)), { keepLast: false });

    const steps = order.map((index) => listing[index]!);
    expect([steps, steps.map((step) => (13 - step) % 13)]).toContainEqual([...Array(13).keys()]);
  });

  it('goes_round_a_shuffled_circle_with_the_heuristics_above_12_free_stops', () => {
    const n = 25;
    const random = seeded(7);
    const listing = [0, ...[...Array(n - 1).keys()].map((i) => i + 1).sort(() => random() - 0.5)];

    const order = optimiseOrder(straightLineMatrix(circle(n, listing)), { keepLast: false });

    expect(n - 1).toBeGreaterThan(MAX_EXACT_FREE_STOPS);
    const steps = order.map((index) => listing[index]!);
    expect([steps, steps.map((step) => (n - step) % n)]).toContainEqual([...Array(n).keys()]);
  });

  it('keeps_the_end_with_the_heuristics', () => {
    const listing = [0, 9, 2, 14, 5, 11, 1, 13, 7, 3, 12, 6, 10, 4, 8, 15];

    const order = optimiseOrder(straightLineMatrix(street(listing)), { keepLast: true });

    expect(order.map((index) => listing[index])).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('returns_a_permutation_starting_at_the_first_stop', () => {
    const cost = straightLineMatrix(randomPoints(seeded(3), 25));

    const order = optimiseOrder(cost, { keepLast: false });

    expect(order[0]).toBe(0);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(25).keys()]);
  });

  it('answers_the_same_order_for_the_same_input', () => {
    const cost = straightLineMatrix(randomPoints(seeded(11), 20));

    expect(optimiseOrder(cost, { keepLast: false })).toEqual(
      optimiseOrder(cost, { keepLast: false }),
    );
  });
});
