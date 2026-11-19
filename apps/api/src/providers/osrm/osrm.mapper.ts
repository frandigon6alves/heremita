// OSRM (FOSSGIS `routing.openstreetmap.de`) → provider-neutral `RouteResult`.
import type { LngLat, TravelMode } from '@heremita/shared';
import {
  OSM_ATTRIBUTION,
  ProviderError,
  type RouteLeg,
  type RouteResult,
  type SnappedStop,
} from '../core/contract.js';
import { estimateLeg, routeQuality, sumLegs } from '../core/estimates.js';
import { decodePolyline, encodePolyline } from '../core/geo.js';
import {
  osrmErrorSchema,
  osrmRouteOkSchema,
  type OsrmError,
  type OsrmRouteOk,
} from './osrm.schemas.js';

export const OSRM_PROVIDER_ID = 'osrm-fossgis';

/** FOSSGIS serves one OSRM instance per profile under its own path. */
const PROFILE_PATH: Record<TravelMode, string> = {
  walk: 'routed-foot',
  bike: 'routed-bike',
  drive: 'routed-car',
};

/**
 * A stop OSRM moved farther than this onto its network is off the network: OSRM
 * answers `Ok` even for a stop an ocean away, snapped to the nearest road it knows.
 */
export const MAX_SNAP_METERS: Record<TravelMode, number> = {
  walk: 1_000,
  bike: 1_000,
  drive: 3_000,
};

/** Snapped waypoints are vertices of the route geometry, up to the 6- vs 5-decimal rounding. */
const VERTEX_TOLERANCE_DEGREES = 1.5e-5;
const URL_COORDINATE_DECIMALS = 6;

/** `/route` for `stops` in order; the `driving` profile segment is ignored by FOSSGIS. */
export function osrmRouteUrl(baseUrl: string, mode: TravelMode, stops: readonly LngLat[]): string {
  const coordinates = stops
    .map(
      (stop) =>
        `${stop.lng.toFixed(URL_COORDINATE_DECIMALS)},${stop.lat.toFixed(URL_COORDINATE_DECIMALS)}`,
    )
    .join(';');
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/${PROFILE_PATH[mode]}/route/v1/driving/${coordinates}?overview=full&geometries=polyline&steps=false&generate_hints=false&alternatives=false`;
}

/** Maps an OSRM error code; `NoSegment` names the stop OSRM could not place. */
export function providerErrorFromOsrm(body: OsrmError): ProviderError {
  const message = body.message ?? body.code;
  switch (body.code) {
    case 'NoRoute':
      return new ProviderError(OSRM_PROVIDER_ID, 'no_route', message);
    case 'NoSegment': {
      const index = /coordinate (\d+)/.exec(message)?.[1];
      return new ProviderError(OSRM_PROVIDER_ID, 'unroutable_stop', message, {
        stopIndex: index === undefined ? undefined : Number(index),
      });
    }
    case 'TooBig':
      return new ProviderError(OSRM_PROVIDER_ID, 'too_many_stops', message);
    default:
      return new ProviderError(OSRM_PROVIDER_ID, 'bad_request', message);
  }
}

/**
 * Any OSRM answer, whatever its HTTP status (a 200 may carry an error code):
 * the route, or a `ProviderError` for an error code or an unexpected body.
 */
export function routeFromOsrmBody(
  mode: TravelMode,
  stops: readonly LngLat[],
  body: unknown,
): RouteResult {
  const ok = osrmRouteOkSchema.safeParse(body);
  if (ok.success) {
    return routeFromOsrm(mode, stops, ok.data);
  }
  const error = osrmErrorSchema.safeParse(body);
  if (error.success) {
    throw providerErrorFromOsrm(error.data);
  }
  throw new ProviderError(OSRM_PROVIDER_ID, 'bad_response', 'unexpected OSRM body', {
    cause: ok.error,
  });
}

/**
 * Cuts the route geometry at the snapped waypoints into one polyline per leg.
 * A leg touching a stop snapped beyond `MAX_SNAP_METERS` becomes a straight-line estimate.
 */
export function routeFromOsrm(
  mode: TravelMode,
  stops: readonly LngLat[],
  body: OsrmRouteOk,
): RouteResult {
  const route = body.routes[0]!;
  if (body.waypoints.length !== stops.length || route.legs.length !== stops.length - 1) {
    throw new ProviderError(
      OSRM_PROVIDER_ID,
      'bad_response',
      'waypoints or legs do not match the stops',
    );
  }
  const snapped = body.waypoints.map((waypoint): SnappedStop => ({
    location: { lng: waypoint.location[0], lat: waypoint.location[1] },
    offNetworkMeters: Math.round(waypoint.distance),
    routable: waypoint.distance <= MAX_SNAP_METERS[mode],
  }));
  const vertices = decodePolyline(route.geometry);
  const cuts = cutIndexes(vertices, snapped);
  const legs = route.legs.map((leg, i): RouteLeg => {
    if (!snapped[i]!.routable || !snapped[i + 1]!.routable) {
      return estimateLeg(mode, stops[i]!, stops[i + 1]!);
    }
    return {
      distanceMeters: Math.round(leg.distance),
      durationSeconds: Math.round(leg.duration),
      polyline: encodePolyline(vertices.slice(cuts[i], cuts[i + 1]! + 1)),
      estimated: false,
    };
  });
  return {
    provider: OSRM_PROVIDER_ID,
    mode,
    quality: routeQuality(legs),
    ...sumLegs(legs),
    legs,
    snapped,
    attribution: OSM_ATTRIBUTION,
  };
}

/** Index of each snapped waypoint on the geometry, searching forward from the previous one. */
function cutIndexes(vertices: readonly LngLat[], snapped: readonly SnappedStop[]): number[] {
  const cuts: number[] = [];
  let from = 0;
  for (const stop of snapped) {
    const found = vertices.findIndex(
      (vertex, index) =>
        index >= from &&
        Math.abs(vertex.lng - stop.location.lng) <= VERTEX_TOLERANCE_DEGREES &&
        Math.abs(vertex.lat - stop.location.lat) <= VERTEX_TOLERANCE_DEGREES,
    );
    if (found === -1) {
      throw new ProviderError(
        OSRM_PROVIDER_ID,
        'bad_response',
        'snapped waypoint not found on the geometry',
      );
    }
    cuts.push(found);
    from = found;
  }
  return cuts;
}
