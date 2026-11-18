// Straight-line fallback for legs no provider routed (provider down, throttled, no route,
// stop off the network). Estimates are labelled `estimated: true` and never cached.
import type { LngLat, TravelMode } from '@heremita/shared';
import { OSM_ATTRIBUTION, type RouteLeg, type RouteResult } from './contract.js';
import { encodePolyline, haversineMeters } from './geo.js';

/** Measured walking detour in Lisbon: median 1.38, mean 1.49 over 34 legs. */
export const ESTIMATE_DETOUR_FACTOR = 1.4;
/** km/h. Bike 15 is an assumption (hilly Lisbon measured 8.4). */
export const ESTIMATE_SPEED_KMH: Record<TravelMode, number> = { walk: 4.6, bike: 15, drive: 30 };
/** Driving legs longer than this leave town: highway speed applies. */
export const DRIVE_LONG_FROM_METERS = 10_000;
export const DRIVE_LONG_SPEED_KMH = 65;

const METERS_PER_SECOND_PER_KMH = 1 / 3.6;

/** km/h for a leg of this length in this mode. */
export function estimateSpeedKmh(mode: TravelMode, distanceMeters: number): number {
  return mode === 'drive' && distanceMeters > DRIVE_LONG_FROM_METERS
    ? DRIVE_LONG_SPEED_KMH
    : ESTIMATE_SPEED_KMH[mode];
}

/** Seconds to cover `distanceMeters` at the estimate speed of `mode`. */
export function estimateDurationSeconds(mode: TravelMode, distanceMeters: number): number {
  return Math.round(
    distanceMeters / (estimateSpeedKmh(mode, distanceMeters) * METERS_PER_SECOND_PER_KMH),
  );
}

export function estimateLeg(mode: TravelMode, from: LngLat, to: LngLat): RouteLeg {
  const distanceMeters = Math.round(haversineMeters(from, to) * ESTIMATE_DETOUR_FACTOR);
  return {
    distanceMeters,
    durationSeconds: estimateDurationSeconds(mode, distanceMeters),
    polyline: encodePolyline([from, to]),
    estimated: true,
  };
}

/** `routed` when no leg is estimated, `estimated` when all are, else `partial`. */
export function routeQuality(legs: readonly Pick<RouteLeg, 'estimated'>[]): RouteResult['quality'] {
  const estimated = legs.filter((leg) => leg.estimated).length;
  if (estimated === 0) {
    return 'routed';
  }
  return estimated === legs.length ? 'estimated' : 'partial';
}

export function sumLegs(legs: readonly RouteLeg[]): {
  distanceMeters: number;
  durationSeconds: number;
} {
  return {
    distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
  };
}

/** Whole-route fallback: every leg a straight-line estimate, every stop unroutable. */
export function estimateRoute(mode: TravelMode, stops: readonly LngLat[]): RouteResult {
  const legs = stops.slice(1).map((to, i) => estimateLeg(mode, stops[i]!, to));
  return {
    provider: 'estimate',
    mode,
    quality: 'estimated',
    ...sumLegs(legs),
    legs,
    snapped: stops.map((location) => ({ location, offNetworkMeters: 0, routable: false })),
    attribution: OSM_ATTRIBUTION,
  };
}
