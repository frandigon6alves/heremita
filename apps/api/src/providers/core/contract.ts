// Provider-neutral contract between feature services and geocoding/routing adapters.
// No upstream vocabulary leaks out of it: adapters map Photon, Nominatim and OSRM
// answers into these shapes, and services never see a raw upstream body.
import {
  boundingBoxSchema,
  lngLatSchema,
  osmTypeSchema,
  placeAddressSchema,
  placeCategorySchema,
  placeKeySchema,
  placeKindSchema,
  type BoundingBox,
  type LngLat,
  type Locale,
  type PlaceCategory,
  type PlaceKey,
  type RouteProvider,
  type RouteQuality,
  type TravelMode,
} from '@heremita/shared';
import { z } from 'zod';

/**
 * A geocoder hit as an adapter returns it. The API's `PlaceResult` response adds
 * `placeId` and `rating`; `osmKey`/`osmValue` stay server-side so the category
 * can be re-derived when the mapping changes.
 */
export const providerPlaceSchema = z.object({
  key: placeKeySchema,
  ref: z.object({ osmType: osmTypeSchema, osmId: z.int().positive() }),
  name: z.string(),
  label: z.string(),
  category: placeCategorySchema,
  kind: placeKindSchema,
  osmKey: z.string(),
  osmValue: z.string(),
  location: lngLatSchema,
  bbox: boundingBoxSchema.optional(),
  address: placeAddressSchema,
});
export type PlaceResult = z.infer<typeof providerPlaceSchema>;

export type PlaceSearchIntent = 'autocomplete' | 'submit';

export interface SearchQuery {
  /** Empty only when `categories` is set ("museums near here"). */
  text: string;
  locale: Locale;
  /** `autocomplete` = as-you-type: never reaches a provider that forbids it (Nominatim). */
  intent: PlaceSearchIntent;
  bias?: { center: LngLat; zoom?: number };
  within?: BoundingBox;
  categories?: PlaceCategory[];
  limit: number;
}

export interface ReverseQuery {
  point: LngLat;
  locale: Locale;
  radiusMeters: number;
  limit: number;
}

export type GeocodingProviderId = 'photon' | 'nominatim' | 'fake';

export interface GeocodingProvider {
  readonly id: GeocodingProviderId;
  search(query: SearchQuery, signal?: AbortSignal): Promise<PlaceResult[]>;
  /** Nearest first; empty when nothing is around (open sea). */
  reverse(query: ReverseQuery, signal?: AbortSignal): Promise<PlaceResult[]>;
  /** Resolves known place keys; unknown keys are simply absent from the answer. */
  lookup?(keys: readonly PlaceKey[], locale: Locale, signal?: AbortSignal): Promise<PlaceResult[]>;
}

/** Resolves place keys the cache no longer holds (Nominatim `/lookup`, or the fake gazetteer). */
export interface PlaceLookup {
  lookup(keys: readonly PlaceKey[], locale: Locale, signal?: AbortSignal): Promise<PlaceResult[]>;
}

export interface RouteRequest {
  mode: TravelMode;
  /** 2..`maxStops`, in visiting order. */
  stops: LngLat[];
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  /** Encoded polyline, precision 5, for this leg only. */
  polyline: string;
  /** true = straight-line estimate (provider down, no route, or a stop off the network). */
  estimated: boolean;
}

export interface SnappedStop {
  /** Where the provider put the stop on its network. */
  location: LngLat;
  offNetworkMeters: number;
  routable: boolean;
}

export interface RouteResult {
  provider: RouteProvider;
  mode: TravelMode;
  quality: RouteQuality;
  distanceMeters: number;
  durationSeconds: number;
  /** `stops.length - 1` legs. */
  legs: RouteLeg[];
  snapped: SnappedStop[];
  attribution: string;
}

export type RoutingProviderId = 'osrm-fossgis' | 'fake';

export interface RoutingProvider {
  readonly id: RoutingProviderId;
  readonly capabilities: { modes: readonly TravelMode[]; maxStops: number };
  route(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult>;
}

/** Stops one routing call may carry (FOSSGIS answers `TooBig` above it). */
export const MAX_ROUTE_STOPS = 25;

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export const PROVIDER_ERROR_KINDS = [
  /** Our bug or invalid input: an upstream 4xx other than the cases below. */
  'bad_request',
  /** OSRM `NoRoute`. */
  'no_route',
  /** OSRM `NoSegment`; carries `stopIndex`. */
  'unroutable_stop',
  /** OSRM `TooBig`. */
  'too_many_stops',
  /** 429/403, a paused host, or no token from the host's bucket in time. */
  'rate_limited',
  'timeout',
  /** Network error, 5xx, or open circuit. */
  'unavailable',
  /** A success body that fails the upstream schema. */
  'bad_response',
] as const;
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

export interface ProviderErrorOptions {
  stopIndex?: number;
  /** Seconds after which trying again makes sense (`rate_limited` only). */
  retryAfterSeconds?: number;
  cause?: unknown;
}

/** Why a provider call failed, in provider-neutral terms. */
export class ProviderError extends Error {
  override readonly name = 'ProviderError';
  /** Worth another attempt later: the host may answer then. */
  readonly retryable: boolean;
  readonly stopIndex: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    message: string,
    options: ProviderErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.retryable = kind === 'timeout' || kind === 'unavailable';
    this.stopIndex = options.stopIndex;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** Injection token of the selected `GeocodingProvider`. */
export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');
/** Injection token of the selected `RoutingProvider`. */
export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');
/** Injection token of the `PlaceLookup`, or `null` when no lookup source is configured. */
export const PLACE_LOOKUP = Symbol('PLACE_LOOKUP');
