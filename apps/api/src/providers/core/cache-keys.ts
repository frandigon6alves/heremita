// Keys and lifetimes of `provider_cache` rows. Keys are built from validated,
// canonical parameters only, and carry the provider id so fake and real answers
// never share an entry. The served-place entry is keyed by OSM identity alone:
// it is what the client saw and may save, whoever produced it.
import { lngLatSchema, type LngLat, type PlaceKey, type TravelMode } from '@heremita/shared';
import { z } from 'zod';
import type { GeocodingProviderId, RoutingProviderId } from './contract.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const CACHE_TTL_MS = {
  photonSearch: DAY_MS,
  photonSearchEmpty: HOUR_MS,
  photonReverse: 7 * DAY_MS,
  nominatimSearch: DAY_MS,
  nominatimLookup: 30 * DAY_MS,
  fakeGeocoder: DAY_MS,
  /** A place served to a client by search or reverse, so saving it needs no upstream call. */
  place: DAY_MS,
  /** FOSSGIS refreshes its data about every two days. */
  leg: 7 * DAY_MS,
} as const;

/** Decimals of coordinates in leg keys (about 1 m). Geocoder URLs round to 4 (about 11 m). */
export const LEG_KEY_DECIMALS = 5;
export const GEO_KEY_DECIMALS = 4;

/** Fixed decimals without a `-0` variant, so equal points always give equal keys. */
export function roundCoordinate(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return /^-0\.?0*$/.test(text) ? text.slice(1) : text;
}

function point(location: LngLat): string {
  return `${roundCoordinate(location.lng, LEG_KEY_DECIMALS)},${roundCoordinate(location.lat, LEG_KEY_DECIMALS)}`;
}

export const cacheKeys = {
  /** `canonicalRequest` = the canonical upstream URL (Photon, Nominatim) or query (fake). */
  geo(provider: GeocodingProviderId, canonicalRequest: string): string {
    return `geo:v1:${provider}:${canonicalRequest}`;
  },
  place(key: PlaceKey): string {
    return `place:v1:${key}`;
  },
  leg(provider: RoutingProviderId, mode: TravelMode, from: LngLat, to: LngLat): string {
    return `leg:v1:${provider}:${mode}:${point(from)}>${point(to)}`;
  },
};

const snappedStopSchema = z.object({
  location: lngLatSchema,
  offNetworkMeters: z.number().min(0),
  routable: z.boolean(),
});

/** Value of a `leg:v1:` entry: a routed leg, never an estimate. */
export const cachedLegSchema = z.object({
  distanceMeters: z.number().min(0),
  durationSeconds: z.number().min(0),
  polyline: z.string(),
  snapped: z.tuple([snappedStopSchema, snappedStopSchema]),
});
export type CachedLeg = z.infer<typeof cachedLegSchema>;
