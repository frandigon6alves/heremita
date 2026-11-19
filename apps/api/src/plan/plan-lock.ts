import type { TravelMode } from '@heremita/shared';
import { ApiProblem } from '../core/http/api-problem.js';
import type { Prisma } from '../generated/prisma/client.js';

/** What a structural write needs from its trip once the lock is held. */
export interface LockedPlan {
  /** The version this write produces (already bumped). */
  planVersion: number;
  defaultMode: TravelMode;
  startDate: Date | null;
}

interface LockedRow {
  plan_version: number;
  default_mode: TravelMode;
  start_date: Date | null;
}

export function tripNotFound(): ApiProblem {
  return new ApiProblem('trip_not_found', 'No such trip.');
}

/**
 * First statement of every structural plan write (§I.api.mechanics "Plan lock"):
 * scopes the trip to its owner, takes the trip row lock that serialises the
 * trip's writers, and bumps `plan_version`, all at once. Preconditions are
 * checked after it, on fresh data. Another user's trip → 404 `trip_not_found`.
 */
export async function lockPlan(
  tx: Prisma.TransactionClient,
  tripId: string,
  userId: string,
  now: Date,
): Promise<LockedPlan> {
  const [row] = await tx.$queryRaw<LockedRow[]>`
    UPDATE trips SET plan_version = plan_version + 1, updated_at = ${now}
    WHERE id = ${tripId}::uuid AND owner_id = ${userId}::uuid
    RETURNING plan_version, default_mode, start_date`;
  if (!row) {
    throw tripNotFound();
  }
  return {
    planVersion: row.plan_version,
    defaultMode: row.default_mode,
    startDate: row.start_date,
  };
}

/**
 * Holds the trip row lock without moving the plan version, for writes that
 * change the plan only in some cases (E30: a custom pin that really moved).
 * Same lock order as {@link lockPlan}: the trip row first.
 */
export async function holdPlan(
  tx: Prisma.TransactionClient,
  tripId: string,
  userId: string,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ plan_version: number }[]>`
    SELECT plan_version FROM trips
    WHERE id = ${tripId}::uuid AND owner_id = ${userId}::uuid
    FOR UPDATE`;
  if (!row) {
    throw tripNotFound();
  }
  return row.plan_version;
}
