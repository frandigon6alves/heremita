import { LIMITS, type TravelMode } from '@heremita/shared';
import { ApiProblem } from '../core/http/api-problem.js';
import { dayNotFound } from '../core/http/problems.js';
import type { Prisma } from '../generated/prisma/client.js';
import { insertAt, writeDayOrder } from './day-order.js';

export function stopNotFound(): ApiProblem {
  return new ApiProblem('not_found', 'No such stop in this trip.');
}

export function tripPlaceNotFound(): ApiProblem {
  return new ApiProblem('not_found', 'No such place in this trip.');
}

export interface DayRow {
  id: string;
  position: number;
  modeOverride: TravelMode | null;
}

/** A day of the trip, or 404 `not_found` (a day of another trip included). */
export async function dayOfTrip(
  tx: Prisma.TransactionClient,
  tripId: string,
  dayId: string,
): Promise<DayRow> {
  const day = await tx.day.findFirst({
    where: { id: dayId, tripId },
    select: { id: true, position: true, modeOverride: true },
  });
  if (!day) {
    throw dayNotFound();
  }
  return day;
}

/** Ids of a day's stops in visit order. */
export async function stopIdsOf(tx: Prisma.TransactionClient, dayId: string): Promise<string[]> {
  const stops = await tx.stop.findMany({
    where: { dayId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  return stops.map((stop) => stop.id);
}

/** Ids of a trip's days in day order. */
export async function dayIdsOf(tx: Prisma.TransactionClient, tripId: string): Promise<string[]> {
  const days = await tx.day.findMany({
    where: { tripId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  return days.map((day) => day.id);
}

export function dayFull(): ApiProblem {
  return new ApiProblem('day_full', `A day holds at most ${LIMITS.STOPS_PER_DAY} stops.`);
}

export interface NewStop {
  tripId: string;
  dayId: string;
  tripPlaceId: string;
  /** Clamped to `[0, n]`; none appends. */
  index: number | undefined;
}

/** Schedules a trip place on a day at the clamped index; a full day → 409 `day_full`. */
export async function insertStop(
  tx: Prisma.TransactionClient,
  stop: NewStop,
  now: Date,
): Promise<string> {
  const current = await stopIdsOf(tx, stop.dayId);
  if (current.length >= LIMITS.STOPS_PER_DAY) {
    throw dayFull();
  }
  const created = await tx.stop.create({
    data: {
      tripId: stop.tripId,
      dayId: stop.dayId,
      tripPlaceId: stop.tripPlaceId,
      position: current.length,
      createdAt: now,
    },
    select: { id: true },
  });
  const order = insertAt(current, created.id, stop.index);
  if (order.at(-1) !== created.id) {
    await writeDayOrder(tx, stop.dayId, order);
  }
  return created.id;
}
