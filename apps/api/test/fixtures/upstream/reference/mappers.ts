// Upstream -> provider-neutral mappers. Pure functions, exercised against the real samples in run.ts.
import type { z } from 'zod';
import { categoryFromOsm, PHOTON_INCLUDE, type PlaceCategory } from './categories.ts';
import { ProviderError, type LngLat, type PlaceKind, type PlaceResult, type RouteLeg, type RouteResult, type SearchQuery, type TravelMode } from './contract.ts';
import { decodePolyline, encodePolyline, haversineMeters } from './geo.ts';
import type { OsrmError, OsrmRouteOk, PhotonFeature } from './upstream-schemas.ts';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

// ---------- Photon ----------
const KIND_BY_LAYER: Record<string, PlaceKind> = { street: 'street', locality: 'area', district: 'area', city: 'area', county: 'area', state: 'area', country: 'area' };

export function placeFromPhoton(feature: z.infer<typeof PhotonFeature>): PlaceResult {
  const p = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  const category = categoryFromOsm(p.osm_key, p.osm_value);
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
  const name = p.name ?? (streetLine || p.city || p.country || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  const kind: PlaceKind = KIND_BY_LAYER[p.type ?? ''] ?? (p.osm_key === 'place' && p.osm_value === 'house' ? 'address' : 'poi');
  const locality = [p.district, p.city].filter((part) => part && part !== name).join(', ');
  const label = [streetLine !== name ? streetLine : '', locality, p.country !== name ? p.country : ''].filter(Boolean).join(' · ');
  return {
    key: `osm:${p.osm_type}:${p.osm_id}`,
    ref: { osmType: p.osm_type, osmId: p.osm_id },
    name,
    label,
    category,
    kind,
    osmKey: p.osm_key,
    osmValue: p.osm_value,
    location: { lng, lat },
    // Photon extent is [west, north, east, south]
    bbox: p.extent ? { west: p.extent[0], north: p.extent[1], east: p.extent[2], south: p.extent[3] } : undefined,
    address: { houseNumber: p.housenumber, street: p.street, district: p.district, city: p.city, state: p.state, postcode: p.postcode, country: p.country, countryCode: p.countrycode },
  };
}

/** Photon returned the same object twice in one response (2026-11-18), so always de-duplicate by key. */
export function dedupePlaces(places: PlaceResult[]): PlaceResult[] {
  const seen = new Set<string>();
  return places.filter((place) => (seen.has(place.key) ? false : (seen.add(place.key), true)));
}

export function photonSearchUrl(base: string, query: SearchQuery): string {
  const params = new URLSearchParams();
  const text = query.text.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (text) params.set('q', text);
  // Photon supports only default|de|en|fr. Anything else is a 400, so the UI locale is never passed through.
  params.set('lang', query.locale === 'en' ? 'en' : 'default');
  params.set('limit', String(Math.min(query.limit ?? 6, 20)));
  if (query.bias) {
    params.set('lat', query.bias.center.lat.toFixed(4));
    params.set('lon', query.bias.center.lng.toFixed(4));
    if (query.bias.zoom !== undefined) params.set('zoom', String(Math.max(3, Math.min(18, Math.round(query.bias.zoom)))));
  }
  if (query.within) params.set('bbox', [query.within.west, query.within.south, query.within.east, query.within.north].map((n) => n.toFixed(4)).join(','));
  const include = (query.categories ?? []).filter((c): c is Exclude<PlaceCategory, 'other'> => c !== 'other').flatMap((c) => PHOTON_INCLUDE[c]);
  if (include.length > 0) params.set('include', include.join(','));
  return `${base}/api/?${params.toString()}`;
}

// ---------- OSRM ----------
export const OSRM_PATH_BY_MODE: Record<TravelMode, string> = { walk: 'routed-foot', bike: 'routed-bike', drive: 'routed-car' };
/** A stop snapped farther than this is treated as not on the network (tunable). */
export const MAX_SNAP_METERS: Record<TravelMode, number> = { walk: 1000, bike: 1000, drive: 3000 };
const ESTIMATE = { detour: 1.4, speedKmh: { walk: 4.6, bike: 15, drive: 30 } as Record<TravelMode, number>, driveLongKmh: 65, driveLongFromMeters: 10_000 };

export function osrmRouteUrl(base: string, mode: TravelMode, stops: LngLat[]): string {
  const coordinates = stops.map((s) => `${s.lng.toFixed(6)},${s.lat.toFixed(6)}`).join(';');
  // The {profile} segment ("driving") is ignored by the server; the path prefix selects the profile.
  return `${base}/${OSRM_PATH_BY_MODE[mode]}/route/v1/driving/${coordinates}?overview=full&geometries=polyline&steps=false&generate_hints=false`;
}

export function estimateLeg(mode: TravelMode, from: LngLat, to: LngLat): RouteLeg {
  const distanceMeters = Math.round(haversineMeters(from, to) * ESTIMATE.detour);
  const kmh = mode === 'drive' && distanceMeters > ESTIMATE.driveLongFromMeters ? ESTIMATE.driveLongKmh : ESTIMATE.speedKmh[mode];
  return { distanceMeters, durationSeconds: Math.round(distanceMeters / (kmh / 3.6)), polyline: encodePolyline([from, to]), estimated: true };
}

/** Whole-route fallback used when the provider is down, throttled, or answers NoRoute. */
export function estimateRoute(mode: TravelMode, stops: LngLat[]): RouteResult {
  const legs = stops.slice(1).map((to, i) => estimateLeg(mode, stops[i]!, to));
  return {
    provider: 'estimate', mode, quality: 'estimated',
    distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    legs,
    snapped: stops.map((location) => ({ location, offNetworkMeters: 0, routable: false })),
    attribution: OSM_ATTRIBUTION,
  };
}

export function routeFromOsrm(mode: TravelMode, stops: LngLat[], body: z.infer<typeof OsrmRouteOk>): RouteResult {
  const route = body.routes[0]!;
  if (body.waypoints.length !== stops.length || route.legs.length !== stops.length - 1 || !route.geometry) {
    throw new ProviderError('osrm-fossgis', 'bad_response', 'waypoints/legs do not match the request');
  }
  const snapped = body.waypoints.map((w) => ({ location: { lng: w.location[0], lat: w.location[1] }, offNetworkMeters: Math.round(w.distance), routable: w.distance <= MAX_SNAP_METERS[mode] }));
  // Split the single overview polyline into legs at the snapped waypoints (each one is a vertex, in order).
  const vertices = decodePolyline(route.geometry, 5);
  const cuts: number[] = [];
  let cursor = 0;
  for (const s of snapped) {
    let found = -1;
    for (let i = cursor; i < vertices.length; i++) {
      if (Math.abs(vertices[i]!.lng - s.location.lng) <= 1.5e-5 && Math.abs(vertices[i]!.lat - s.location.lat) <= 1.5e-5) { found = i; break; }
    }
    if (found === -1) throw new ProviderError('osrm-fossgis', 'bad_response', 'snapped waypoint not found on the geometry');
    cuts.push(found);
    cursor = found;
  }
  const legs: RouteLeg[] = route.legs.map((leg, i) => {
    // OSRM answers "Ok" even when a stop is an ocean away: it snaps it to the nearest road it knows.
    if (!snapped[i]!.routable || !snapped[i + 1]!.routable) return estimateLeg(mode, stops[i]!, stops[i + 1]!);
    return { distanceMeters: Math.round(leg.distance), durationSeconds: Math.round(leg.duration), polyline: encodePolyline(vertices.slice(cuts[i]!, cuts[i + 1]! + 1)), estimated: false };
  });
  const estimatedCount = legs.filter((leg) => leg.estimated).length;
  return {
    provider: 'osrm-fossgis', mode,
    quality: estimatedCount === 0 ? 'routed' : estimatedCount === legs.length ? 'estimated' : 'partial',
    distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    legs, snapped, attribution: OSM_ATTRIBUTION,
  };
}

export function providerErrorFromOsrm(body: z.infer<typeof OsrmError>): ProviderError {
  const message = body.message ?? body.code;
  switch (body.code) {
    case 'NoRoute': case 'NoTrips': case 'NoTable': return new ProviderError('osrm-fossgis', 'no_route', message);
    case 'NoSegment': {
      const index = /coordinate (\d+)/.exec(message)?.[1];
      return new ProviderError('osrm-fossgis', 'unroutable_stop', message, { stopIndex: index === undefined ? undefined : Number(index) });
    }
    case 'TooBig': return new ProviderError('osrm-fossgis', 'too_many_stops', message);
    default: return new ProviderError('osrm-fossgis', 'bad_request', message);
  }
}
