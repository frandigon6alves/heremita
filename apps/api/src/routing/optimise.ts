// Visiting order of a day's stops: an open path from the first stop, which never
// moves, optionally ending at the last stop. Deterministic: the same matrix
// always gives the same order (ties go to the lower stop index).
// SHORTCUT(owner): stop order optimised on straight-line distances — ceiling: +7.5 % walking time vs OSRM /trip on the 25-stop sample; upgrade: a self-hosted router without the 6/min table limit
import type { LngLat } from '@heremita/shared';
import { haversineMeters } from '../providers/core/geo.js';

/** `cost[a][b]`: cost of going from stop `a` to stop `b`. */
export type CostMatrix = readonly (readonly number[])[];

/** Held-Karp is exact but O(2^k·k²): above this many free stops, heuristics take over. */
export const MAX_EXACT_FREE_STOPS = 12;
/** Longest block Or-opt moves at once. */
const OR_OPT_MAX_BLOCK = 3;
/** An improvement smaller than this is float noise, not a better path. */
const EPSILON = 1e-9;

export function straightLineMatrix(points: readonly LngLat[]): number[][] {
  return points.map((from) => points.map((to) => haversineMeters(from, to)));
}

export function pathCost(cost: CostMatrix, order: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i += 1) {
    total += cost[order[i - 1]!]![order[i]!]!;
  }
  return total;
}

/**
 * Indexes of the stops in suggested order, starting with 0; with `keepLast`
 * the last stop stays last. Exact up to `MAX_EXACT_FREE_STOPS` free stops;
 * above, the best of nearest-neighbour and cheapest-insertion seeds improved
 * by 2-opt and Or-opt (with a free end, also tried with every stop as the end).
 */
export function optimiseOrder(cost: CostMatrix, { keepLast }: { keepLast: boolean }): number[] {
  const n = cost.length;
  if (n <= 2) {
    return Array.from({ length: n }, (_, i) => i);
  }
  const end = keepLast ? n - 1 : null;
  const freeStops = n - 1 - (keepLast ? 1 : 0);
  if (freeStops <= MAX_EXACT_FREE_STOPS) {
    return heldKarp(cost, end);
  }
  if (end !== null) {
    return improvedSeeds(cost, end);
  }
  const candidates = [improvedSeeds(cost, null)];
  for (let forcedEnd = 1; forcedEnd < n; forcedEnd += 1) {
    candidates.push(improvedSeeds(cost, forcedEnd));
  }
  return cheapest(cost, candidates);
}

/** Stops other than the start and the fixed end, in index order. */
function freeStopsOf(n: number, end: number | null): number[] {
  return Array.from({ length: n - 1 }, (_, i) => i + 1).filter((stop) => stop !== end);
}

/** First of the cheapest orders. */
function cheapest(cost: CostMatrix, orders: readonly number[][]): number[] {
  return orders.reduce((best, order) =>
    pathCost(cost, order) < pathCost(cost, best) - EPSILON ? order : best,
  );
}

/** Exact dynamic programme over subsets of free stops. */
function heldKarp(cost: CostMatrix, end: number | null): number[] {
  const free = freeStopsOf(cost.length, end);
  const k = free.length;
  const subsets = 1 << k;
  const best = new Float64Array(subsets * k).fill(Number.POSITIVE_INFINITY);
  const previous = new Int16Array(subsets * k).fill(-1);
  free.forEach((stop, j) => {
    best[(1 << j) * k + j] = cost[0]![stop]!;
  });
  for (let mask = 1; mask < subsets; mask += 1) {
    for (let j = 0; j < k; j += 1) {
      const here = best[mask * k + j]!;
      if ((mask & (1 << j)) === 0 || here === Number.POSITIVE_INFINITY) {
        continue;
      }
      for (let next = 0; next < k; next += 1) {
        if ((mask & (1 << next)) !== 0) {
          continue;
        }
        const cell = (mask | (1 << next)) * k + next;
        const candidate = here + cost[free[j]!]![free[next]!]!;
        if (candidate < best[cell]!) {
          best[cell] = candidate;
          previous[cell] = j;
        }
      }
    }
  }
  const all = subsets - 1;
  let last = 0;
  let lastTotal = Number.POSITIVE_INFINITY;
  for (let j = 0; j < k; j += 1) {
    const total = best[all * k + j]! + (end === null ? 0 : cost[free[j]!]![end]!);
    if (total < lastTotal) {
      lastTotal = total;
      last = j;
    }
  }
  const reversed: number[] = [];
  for (let mask = all, j = last; j !== -1;) {
    reversed.push(free[j]!);
    const before = previous[mask * k + j]!;
    mask &= ~(1 << j);
    j = before;
  }
  return [0, ...reversed.reverse(), ...(end === null ? [] : [end])];
}

function improvedSeeds(cost: CostMatrix, end: number | null): number[] {
  return cheapest(cost, [
    localSearch(cost, nearestNeighbour(cost, end), end !== null),
    localSearch(cost, cheapestInsertion(cost, end), end !== null),
  ]);
}

/** From the start, always to the closest unvisited stop. */
function nearestNeighbour(cost: CostMatrix, end: number | null): number[] {
  const remaining = freeStopsOf(cost.length, end);
  const order = [0];
  while (remaining.length > 0) {
    const from = order.at(-1)!;
    const pick = remaining.reduce((best, stop) =>
      cost[from]![stop]! < cost[from]![best]! ? stop : best,
    );
    order.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return end === null ? order : [...order, end];
}

/** Each free stop, in index order, goes where it lengthens the path least. */
function cheapestInsertion(cost: CostMatrix, end: number | null): number[] {
  let order = end === null ? [0] : [0, end];
  for (const stop of freeStopsOf(cost.length, end)) {
    const lastPosition = end === null ? order.length : order.length - 1;
    let bestOrder: number[] | undefined;
    for (let position = 1; position <= lastPosition; position += 1) {
      const candidate = [...order.slice(0, position), stop, ...order.slice(position)];
      if (!bestOrder || pathCost(cost, candidate) < pathCost(cost, bestOrder)) {
        bestOrder = candidate;
      }
    }
    order = bestOrder!;
  }
  return order;
}

/** 2-opt and Or-opt moves until none shortens the path. Position 0 never moves; nor does the end when fixed. */
function localSearch(cost: CostMatrix, seed: readonly number[], fixedEnd: boolean): number[] {
  let order = [...seed];
  let current = pathCost(cost, order);
  const lastMovable = fixedEnd ? order.length - 2 : order.length - 1;
  const accept = (candidate: number[]): boolean => {
    const candidateCost = pathCost(cost, candidate);
    if (candidateCost < current - EPSILON) {
      order = candidate;
      current = candidateCost;
      return true;
    }
    return false;
  };
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < lastMovable; i += 1) {
      for (let j = i + 1; j <= lastMovable; j += 1) {
        const reversedSpan = order.slice(i, j + 1).reverse();
        improved =
          accept([...order.slice(0, i), ...reversedSpan, ...order.slice(j + 1)]) || improved;
      }
    }
    improved = orOptMove(order, lastMovable, fixedEnd, accept) || improved;
  }
  return order;
}

/** Applies the first block move (1..3 stops, direction kept) that `accept` takes. */
function orOptMove(
  order: readonly number[],
  lastMovable: number,
  fixedEnd: boolean,
  accept: (candidate: number[]) => boolean,
): boolean {
  for (let length = 1; length <= OR_OPT_MAX_BLOCK; length += 1) {
    for (let i = 1; i + length - 1 <= lastMovable; i += 1) {
      const block = order.slice(i, i + length);
      const rest = [...order.slice(0, i), ...order.slice(i + length)];
      const lastInsert = fixedEnd ? rest.length - 1 : rest.length;
      for (let position = 1; position <= lastInsert; position += 1) {
        if (
          position !== i &&
          accept([...rest.slice(0, position), ...block, ...rest.slice(position)])
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
