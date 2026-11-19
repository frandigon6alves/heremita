import type { Prisma } from '../generated/prisma/client.js';

/**
 * Added to every position of a list before it is rewritten: above any final
 * position (25 stops, 60 days), so the UNIQUE `(day_id | trip_id, position)`
 * keys never collide while PostgreSQL checks them row by row.
 */
const POSITION_OFFSET = 1000;

/** `index` brought into `[0, length]`; no index means the end. */
export function clampIndex(index: number | undefined, length: number): number {
  return Math.min(index ?? length, length);
}

/** `ids` with `id` inserted at the clamped `index`. */
export function insertAt(ids: readonly string[], id: string, index: number | undefined): string[] {
  const at = clampIndex(index, ids.length);
  return [...ids.slice(0, at), id, ...ids.slice(at)];
}

/**
 * The only writer of `stops.position`: makes `orderedStopIds` the stops of
 * `dayId` at positions `0..n−1`, in that order. A listed stop of another day of
 * the same trip moves into `dayId`. Callers pass every stop the day keeps.
 */
export async function writeDayOrder(
  tx: Prisma.TransactionClient,
  dayId: string,
  orderedStopIds: readonly string[],
): Promise<void> {
  await tx.$executeRaw`
    UPDATE stops SET position = position + ${POSITION_OFFSET} WHERE day_id = ${dayId}::uuid`;
  if (orderedStopIds.length === 0) {
    return;
  }
  await tx.$executeRaw`
    UPDATE stops s SET day_id = d.id, position = v.ord - 1
    FROM unnest(${[...orderedStopIds]}::uuid[]) WITH ORDINALITY AS v(id, ord), days d
    WHERE d.id = ${dayId}::uuid AND s.id = v.id AND s.trip_id = d.trip_id`;
}

/** The only writer of `days.position`: makes `orderedDayIds` the trip's days `0..n−1`, in that order. */
export async function writeTripDayOrder(
  tx: Prisma.TransactionClient,
  tripId: string,
  orderedDayIds: readonly string[],
): Promise<void> {
  await tx.$executeRaw`
    UPDATE days SET position = position + ${POSITION_OFFSET} WHERE trip_id = ${tripId}::uuid`;
  if (orderedDayIds.length === 0) {
    return;
  }
  await tx.$executeRaw`
    UPDATE days d SET position = v.ord - 1
    FROM unnest(${[...orderedDayIds]}::uuid[]) WITH ORDINALITY AS v(id, ord)
    WHERE d.id = v.id AND d.trip_id = ${tripId}::uuid`;
}
