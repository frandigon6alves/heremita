import type { LngLat, TravelMode } from '@heremita/shared';
import { cacheKeys } from '../providers/core/cache-keys.js';
import type { RoutingProviderId } from '../providers/core/contract.js';

/** A stop as routing sees it: where it is and the mode chosen for the leg leaving it. */
export interface RouteStop {
  id: string;
  location: LngLat;
  modeToNext: TravelMode | null;
}

/** One leg to route: from a stop to the next, in its effective mode. */
export interface PlannedLeg {
  fromStopId: string;
  toStopId: string;
  mode: TravelMode;
  from: LngLat;
  to: LngLat;
}

/**
 * Legs between consecutive `stops` in visit order; each leaves its stop in
 * `override ?? stop.modeToNext ?? dayMode` (`dayMode` = `day.modeOverride ?? trip.defaultMode`).
 */
export function plannedLegs(
  stops: readonly RouteStop[],
  dayMode: TravelMode,
  override?: TravelMode,
): PlannedLeg[] {
  return stops.slice(1).map((to, i) => {
    const from = stops[i]!;
    return {
      fromStopId: from.id,
      toStopId: to.id,
      mode: override ?? from.modeToNext ?? dayMode,
      from: from.location,
      to: to.location,
    };
  });
}

/**
 * The `leg:v1:` cache key of a leg. The day route (E40) writes under it and the
 * plan's route summary (E24) reads it, so both must build it here.
 */
export function legCacheKey(router: RoutingProviderId, leg: PlannedLeg): string {
  return cacheKeys.leg(router, leg.mode, leg.from, leg.to);
}
