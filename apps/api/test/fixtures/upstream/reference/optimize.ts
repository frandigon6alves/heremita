// Order optimisation we can run ourselves: open path over a (possibly asymmetric) cost matrix.
// Stop 0 is always the start. With fixedEnd=true the last stop stays last; otherwise the end is free.
// Deterministic: same matrix in, same order out.

export type CostMatrix = ReadonlyArray<ReadonlyArray<number | null>>;

const INF = Number.POSITIVE_INFINITY;
const cost = (m: CostMatrix, a: number, b: number): number => m[a]?.[b] ?? INF;

export function pathCost(m: CostMatrix, order: readonly number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < order.length; i++) total += cost(m, order[i]!, order[i + 1]!);
  return total;
}

/** Exact Held-Karp dynamic programme; use while the number of free stops is <= 12. */
function exactOrder(m: CostMatrix, fixedEnd: boolean): number[] {
  const n = m.length;
  const end = fixedEnd ? n - 1 : -1;
  const free: number[] = [];
  for (let i = 1; i < n; i++) if (i !== end) free.push(i);
  const k = free.length;
  if (k === 0) return fixedEnd ? [0, end] : [0];
  const size = 1 << k;
  const best = new Float64Array(size * k).fill(INF);
  const parent = new Int16Array(size * k).fill(-1);
  for (let j = 0; j < k; j++) best[(1 << j) * k + j] = cost(m, 0, free[j]!);
  for (let mask = 1; mask < size; mask++) {
    for (let j = 0; j < k; j++) {
      const current = best[mask * k + j]!;
      if (!(mask & (1 << j)) || current === INF) continue;
      for (let next = 0; next < k; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const candidate = current + cost(m, free[j]!, free[next]!);
        if (candidate < best[nextMask * k + next]!) {
          best[nextMask * k + next] = candidate;
          parent[nextMask * k + next] = j;
        }
      }
    }
  }
  const full = size - 1;
  let last = 0;
  let bestTotal = INF;
  for (let j = 0; j < k; j++) {
    const total = best[full * k + j]! + (fixedEnd ? cost(m, free[j]!, end) : 0);
    if (total < bestTotal) {
      bestTotal = total;
      last = j;
    }
  }
  const reversed: number[] = [];
  let mask = full;
  let j = last;
  while (j !== -1) {
    reversed.push(free[j]!);
    const p = parent[mask * k + j]!;
    mask &= ~(1 << j);
    j = p;
  }
  const order = [0, ...reversed.reverse()];
  if (fixedEnd) order.push(end);
  return order;
}

/** Seed 1: nearest neighbour from the start. */
function nearestNeighbourSeed(m: CostMatrix, fixedEnd: boolean): number[] {
  const n = m.length;
  const end = fixedEnd ? n - 1 : -1;
  const remaining = new Set<number>();
  for (let i = 1; i < n; i++) if (i !== end) remaining.add(i);
  const order = [0];
  while (remaining.size > 0) {
    const from = order[order.length - 1]!;
    let pick = -1;
    let pickCost = INF;
    for (const candidate of remaining) {
      const c = cost(m, from, candidate);
      if (c < pickCost || pick === -1) {
        pick = candidate;
        pickCost = c;
      }
    }
    order.push(pick);
    remaining.delete(pick);
  }
  if (fixedEnd) order.push(end);
  return order;
}

/** Seed 2: cheapest insertion (each stop goes where it lengthens the path least), in index order. */
function cheapestInsertionSeed(m: CostMatrix, fixedEnd: boolean): number[] {
  const n = m.length;
  const end = fixedEnd ? n - 1 : -1;
  let order = fixedEnd ? [0, end] : [0];
  for (let stop = 1; stop < n; stop++) {
    if (stop === end) continue;
    let bestPos = 1;
    let bestCost = INF;
    const maxPos = fixedEnd ? order.length - 1 : order.length;
    for (let pos = 1; pos <= maxPos; pos++) {
      const c = pathCost(m, [...order.slice(0, pos), stop, ...order.slice(pos)]);
      if (c < bestCost) {
        bestCost = c;
        bestPos = pos;
      }
    }
    order = [...order.slice(0, bestPos), stop, ...order.slice(bestPos)];
  }
  return order;
}

/** Best of two deterministic seeds, each improved by local search. */
function heuristicFixed(m: CostMatrix, fixedEnd: boolean): number[] {
  const a = localSearch(m, nearestNeighbourSeed(m, fixedEnd), fixedEnd);
  const b = localSearch(m, cheapestInsertionSeed(m, fixedEnd), fixedEnd);
  return pathCost(m, b) < pathCost(m, a) ? b : a;
}

/**
 * Free end: besides the plain free-end search, try every stop as the forced end (n <= 25, so at most
 * 24 extra runs of a few milliseconds). Guarantees "free end" is never worse than any fixed end.
 */
function heuristicOrder(m: CostMatrix, fixedEnd: boolean): number[] {
  if (fixedEnd) return heuristicFixed(m, true);
  const n = m.length;
  let best = heuristicFixed(m, false);
  let bestCost = pathCost(m, best);
  for (let end = 1; end < n; end++) {
    // relabel so that `end` becomes the last index, solve with a fixed end, then map back
    const label = [...Array(n).keys()].filter((i) => i !== end);
    label.push(end);
    const permuted = label.map((a) => label.map((b) => m[a]?.[b] ?? null));
    const candidate = heuristicFixed(permuted, true).map((i) => label[i]!);
    const c = pathCost(m, candidate);
    if (c < bestCost - 1e-9) {
      best = candidate;
      bestCost = c;
    }
  }
  return best;
}

/** 2-opt and Or-opt moves until no move improves the path. */
function localSearch(m: CostMatrix, seed: number[], fixedEnd: boolean): number[] {
  let order = seed;
  const lastMovable = fixedEnd ? order.length - 2 : order.length - 1; // index 0 never moves
  let current = pathCost(m, order);
  let improved = true;
  while (improved) {
    improved = false;
    // 2-opt: reverse order[i..j] (full re-evaluation keeps asymmetric matrices correct; n <= 25)
    for (let i = 1; i < lastMovable; i++) {
      for (let j = i + 1; j <= lastMovable; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const c = pathCost(m, candidate);
        if (c < current - 1e-9) {
          order = candidate;
          current = c;
          improved = true;
        }
      }
    }
    // Or-opt: move a block of 1..3 stops to another position, keeping its direction
    for (let length = 1; length <= 3; length++) {
      for (let i = 1; i + length - 1 <= lastMovable; i++) {
        const block = order.slice(i, i + length);
        const rest = [...order.slice(0, i), ...order.slice(i + length)];
        const maxInsert = fixedEnd ? rest.length - 1 : rest.length;
        for (let pos = 1; pos <= maxInsert; pos++) {
          if (pos === i) continue;
          const candidate = [...rest.slice(0, pos), ...block, ...rest.slice(pos)];
          const c = pathCost(m, candidate);
          if (c < current - 1e-9) {
            order = candidate;
            current = c;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }
  return order;
}

export function optimiseOrder(m: CostMatrix, options: { fixedEnd: boolean }): number[] {
  const n = m.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const freeStops = n - 1 - (options.fixedEnd ? 1 : 0);
  return freeStops <= 12 ? exactOrder(m, options.fixedEnd) : heuristicOrder(m, options.fixedEnd);
}
