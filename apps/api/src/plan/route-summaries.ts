import type { DayRouteSummary, LegSummary, LngLat, TravelMode } from '@heremita/shared';
import { cacheKeys, type CachedLeg } from '../providers/core/cache-keys.js';
import type { RoutingProviderId } from '../providers/core/contract.js';

/** A stop as routing sees it: where it is and the mode chosen for the leg leaving it. */
export interface RouteStop {
  id: string;
  location: LngLat;
  modeToNext: TravelMode | null;
}

/** A leg between two consecutive stops, with its effective mode and its `leg:v1:` cache key. */
export interface PlannedLeg {
  fromStopId: string;
  toStopId: string;
  mode: TravelMode;
  key: string;
}

/**
 * The legs of a day in visit order. A leg's mode is `stop.modeToNext ?? dayMode`
 * (`dayMode` = `day.modeOverride ?? trip.defaultMode`).
 */
export function plannedLegs(
  router: RoutingProviderId,
  dayMode: TravelMode,
  stops: readonly RouteStop[],
): PlannedLeg[] {
  return stops.slice(1).map((to, index) => {
    const from = stops[index] as RouteStop;
    const mode = from.modeToNext ?? dayMode;
    return {
      fromStopId: from.id,
      toStopId: to.id,
      mode,
      key: cacheKeys.leg(router, mode, from.location, to.location),
    };
  });
}

/**
 * The route summary of a day from cached legs only: a leg missing from the
 * cache is `null`, and the totals stay `null` unless every leg is known.
 */
export function summariseDayRoute(
  dayId: string,
  legs: readonly PlannedLeg[],
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
