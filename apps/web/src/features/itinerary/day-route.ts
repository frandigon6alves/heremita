import type { DayRoute, DayRouteSummary, LngLat, Stop, TravelMode } from '@heremita/shared';
import { decodePolyline5, type LngLat as MapPoint } from '@/shared/map/geo';
import type { MapRouteLine } from '@/shared/map/route-line-layer';
import type { CssToken } from '@/shared/map/tokens';
import type { PlanLike } from './plan-view';

/** Owner and viewer plans both carry day modes and the cached route summaries. */
export interface RoutedPlan extends PlanLike {
  planVersion: number;
  days: readonly (PlanLike['days'][number] & { mode: TravelMode })[];
  routes: readonly DayRouteSummary[];
}

/** One leg as the list shows it: between two consecutive stops of a day. */
export interface LegView {
  fromStopId: string;
  toStopId: string;
  mode: TravelMode;
  distanceMeters: number;
  durationSeconds: number;
  /** A straight-line estimate, not a routed leg. */
  estimated: boolean;
  /** One of its stops is too far from any road or path for this mode. */
  unroutable: boolean;
}

export interface DayRouteView {
  /** One per pair of consecutive stops; `null` while it is not known yet. */
  legs: (LegView | null)[];
  /** Day totals, only once every leg is known. */
  totals: { distanceMeters: number; durationSeconds: number } | null;
  /** Some known leg is an estimate ("inclui estimativas"). */
  estimated: boolean;
  /** Stops no leg could reach in this mode (the `partial` banner names them). */
  unroutableStopIds: string[];
}

export interface DayRouteInput {
  stops: readonly Stop[];
  /** Where each trip place is, by trip place id. */
  locationOf: (tripPlaceId: string) => LngLat | undefined;
  /** The day's saved mode (`modeOverride ?? trip.defaultMode`). */
  dayMode: TravelMode;
  /** Mode of the URL when it differs from the saved one: it overrides every leg. */
  mode: TravelMode | null;
  /** The plan's cached route summary of the day (no geometry). */
  summary?: DayRouteSummary;
  /** The route the API answered; ignored when it was computed for other stops. */
  route?: DayRoute;
  /** The route request failed: every leg becomes a client straight-line estimate. */
  failed: boolean;
}

const EARTH_RADIUS_METERS = 6_371_008.8;
const RADIANS_PER_DEGREE = Math.PI / 180;
const METERS_PER_SECOND_PER_KMH = 1 / 3.6;
/** Same straight-line estimate the API uses (§V44): detour factor and speeds per mode. */
const ESTIMATE_DETOUR_FACTOR = 1.4;
const ESTIMATE_SPEED_KMH: Record<TravelMode, number> = { walk: 4.6, bike: 15, drive: 30 };
const DRIVE_LONG_FROM_METERS = 10_000;
const DRIVE_LONG_SPEED_KMH = 65;

function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * RADIANS_PER_DEGREE;
  const dLng = (b.lng - a.lng) * RADIANS_PER_DEGREE;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RADIANS_PER_DEGREE) *
      Math.cos(b.lat * RADIANS_PER_DEGREE) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance and time of a leg drawn as a straight line, as the API estimates it. */
export function estimateLeg(
  mode: TravelMode,
  from: LngLat,
  to: LngLat,
): { distanceMeters: number; durationSeconds: number } {
  const distanceMeters = Math.round(haversineMeters(from, to) * ESTIMATE_DETOUR_FACTOR);
  const speedKmh =
    mode === 'drive' && distanceMeters > DRIVE_LONG_FROM_METERS
      ? DRIVE_LONG_SPEED_KMH
      : ESTIMATE_SPEED_KMH[mode];
  return {
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / (speedKmh * METERS_PER_SECOND_PER_KMH)),
  };
}

/** Mode of the leg leaving `stop`: the URL mode, else the stop's own, else the day's. */
export function legMode(stop: Stop, dayMode: TravelMode, mode: TravelMode | null): TravelMode {
  return mode ?? stop.modeToNext ?? dayMode;
}

/** Each stop with the one after it. */
function consecutive<T>(items: readonly T[]): { from: T; to: T }[] {
  return items.slice(1).flatMap((to, i) => {
    const from = items[i];
    return from === undefined ? [] : [{ from, to }];
  });
}

/** The route belongs to these stops, in this order (not a previous version kept on screen). */
function matchesStops(
  legs: readonly { fromStopId: string; toStopId: string }[],
  stops: readonly Stop[],
) {
  return (
    legs.length === Math.max(stops.length - 1, 0) &&
    legs.every((leg, i) => leg.fromStopId === stops[i]?.id && leg.toStopId === stops[i + 1]?.id)
  );
}

function knownLegs({
  stops,
  locationOf,
  dayMode,
  mode,
  summary,
  route,
  failed,
}: DayRouteInput): (LegView | null)[] {
  if (route && matchesStops(route.legs, stops)) {
    return route.legs.map((leg) => ({
      fromStopId: leg.fromStopId,
      toStopId: leg.toStopId,
      mode: leg.mode,
      distanceMeters: leg.distanceMeters,
      durationSeconds: leg.durationSeconds,
      estimated: leg.estimated,
      unroutable: leg.unroutable,
    }));
  }
  const pairs = consecutive(stops);
  if (failed) {
    return pairs.map(({ from, to }) => {
      const fromAt = locationOf(from.tripPlaceId);
      const toAt = locationOf(to.tripPlaceId);
      const legModeOf = legMode(from, dayMode, mode);
      if (!fromAt || !toAt) {
        return null;
      }
      return {
        fromStopId: from.id,
        toStopId: to.id,
        mode: legModeOf,
        ...estimateLeg(legModeOf, fromAt, toAt),
        estimated: true,
        unroutable: false,
      };
    });
  }
  return pairs.map(({ from, to }) => {
    const cached = mode === null ? summary?.legs.find((leg) => leg?.fromStopId === from.id) : null;
    return cached && cached.toStopId === to.id ? { ...cached, unroutable: false } : null;
  });
}

/** Stops whose every leg is unroutable: the ones no road or path reaches. */
function unroutableStops(stops: readonly Stop[], legs: readonly (LegView | null)[]): string[] {
  return stops.flatMap((stop, i) => {
    const adjacent = [legs[i - 1], legs[i]].filter((leg) => leg !== undefined);
    return adjacent.length > 0 && adjacent.every((leg) => leg?.unroutable === true)
      ? [stop.id]
      : [];
  });
}

/**
 * What the list says about a day's route: per-leg time and distance, totals
 * and estimate flags, from the freshest source there is: the route the API
 * answered for these stops, else the plan's cached summary (saved mode only),
 * else, after a failure, client straight-line estimates.
 */
export function dayRouteView(input: DayRouteInput): DayRouteView {
  const legs = knownLegs(input);
  const complete = legs.every((leg) => leg !== null);
  return {
    legs,
    totals:
      complete && legs.length > 0
        ? {
            distanceMeters: legs.reduce((sum, leg) => sum + (leg?.distanceMeters ?? 0), 0),
            durationSeconds: legs.reduce((sum, leg) => sum + (leg?.durationSeconds ?? 0), 0),
          }
        : null,
    estimated: legs.some((leg) => leg?.estimated === true),
    unroutableStopIds: unroutableStops(input.stops, legs),
  };
}

export interface RouteLinesInput {
  id: string;
  stops: readonly Stop[];
  locationOf: (tripPlaceId: string) => LngLat | undefined;
  colorToken: CssToken;
  /** Any route for the day, even one kept from the previous plan version. */
  route?: DayRoute;
  failed: boolean;
}

const toPoint = ({ lng, lat }: LngLat): MapPoint => [lng, lat];

/**
 * Map lines of a day: the routed geometry when there is a route (estimated
 * legs dashed), straight dashed lines after a failure, nothing while loading.
 */
export function dayRouteLines({
  id,
  stops,
  locationOf,
  colorToken,
  route,
  failed,
}: RouteLinesInput): MapRouteLine[] {
  if (route) {
    return route.legs.map((leg, i) => ({
      id: `${id}:${i}`,
      points: decodePolyline5(leg.polyline),
      colorToken,
      estimated: leg.estimated,
    }));
  }
  if (!failed) {
    return [];
  }
  return consecutive(stops).flatMap(({ from, to }, i) => {
    const fromAt = locationOf(from.tripPlaceId);
    const toAt = locationOf(to.tripPlaceId);
    return fromAt && toAt
      ? [
          {
            id: `${id}:${i}`,
            points: [toPoint(fromAt), toPoint(toAt)],
            colorToken,
            estimated: true,
          },
        ]
      : [];
  });
}
