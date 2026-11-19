import type { DayRouteSummary, LegSummary, TravelMode } from '@heremita/shared';
import type { CachedLeg } from '../providers/core/cache-keys.js';
import type { RoutingProviderId } from '../providers/core/contract.js';
import {
  legCacheKey,
  plannedLegs,
  type PlannedLeg,
  type RouteStop,
} from '../routing/planned-legs.js';

/** A planned leg with its `leg:v1:` cache key. */
export type KeyedLeg = PlannedLeg & { key: string };

/** The legs of a day in visit order, keyed for a cache read. */
export function keyedLegs(
  router: RoutingProviderId,
  dayMode: TravelMode,
  stops: readonly RouteStop[],
): KeyedLeg[] {
  return plannedLegs(stops, dayMode).map((leg) => ({ ...leg, key: legCacheKey(router, leg) }));
}

/**
 * The route summary of a day from cached legs only: a leg missing from the
 * cache is `null`, and the totals stay `null` unless every leg is known.
 */
export function summariseDayRoute(
  dayId: string,
  legs: readonly KeyedLeg[],
  cached: ReadonlyMap<string, CachedLeg>,
): DayRouteSummary {
  const summaries = legs.map((leg): LegSummary | null => {
    const hit = cached.get(leg.key);
    return hit
      ? {
          fromStopId: leg.fromStopId,
          toStopId: leg.toStopId,
          mode: leg.mode,
          distanceMeters: hit.distanceMeters,
          durationSeconds: hit.durationSeconds,
          estimated: false,
        }
      : null;
  });
  const known = summaries.filter((leg) => leg !== null);
  const complete = known.length === summaries.length;
  return {
    dayId,
    legs: summaries,
    distanceMeters: complete ? known.reduce((sum, leg) => sum + leg.distanceMeters, 0) : null,
    durationSeconds: complete ? known.reduce((sum, leg) => sum + leg.durationSeconds, 0) : null,
  };
}
