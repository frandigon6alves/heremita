// Provider-neutral contract (candidate for packages/shared). No upstream vocabulary leaks out of it.
import type { PlaceCategory } from './categories.ts';

export type LngLat = { lng: number; lat: number };
export type BBox = { west: number; south: number; east: number; north: number };
export type Locale = 'pt-BR' | 'en';
export type TravelMode = 'walk' | 'bike' | 'drive';
export type PlaceKind = 'poi' | 'address' | 'street' | 'area';

/** Identity of a place in OpenStreetMap. Unique key: osmType + osmId. */
export interface PlaceRef {
  osmType: 'N' | 'W' | 'R';
  osmId: number;
}

export interface PlaceResult {
  /** "osm:N:4919986733"; the string reviews and saved places hang on. */
  key: string;
  ref: PlaceRef;
  name: string;
  /** One line for lists: "Av. Paulista 1578 · Bela Vista, São Paulo · Brasil". */
  label: string;
  category: PlaceCategory;
  kind: PlaceKind;
  /** Raw OSM class/type, stored so the category can be re-derived when the mapping changes. */
  osmKey: string;
  osmValue: string;
  location: LngLat;
  bbox?: BBox;
  address: {
    houseNumber?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countryCode?: string; // ISO 3166-1 alpha-2, upper case
  };
}

export interface SearchQuery {
  /** May be empty only when `categories` is set ("museums near here"). */
  text: string;
  locale: Locale;
  /** autocomplete = as-you-type (must only reach providers that allow it); submit = explicit search. */
  intent: 'autocomplete' | 'submit';
  bias?: { center: LngLat; zoom?: number };
  within?: BBox;
  categories?: PlaceCategory[];
  limit?: number; // default 6, max 20
}

export interface ReverseQuery {
  point: LngLat;
  locale: Locale;
  radiusMeters?: number; // default 150
  limit?: number; // default 5
}

export interface GeocodingProvider {
  readonly id: string; // 'photon' | 'nominatim' | 'fake'
  readonly capabilities: {
    autocomplete: boolean;
    categoryFilter: boolean;
    /** Locales whose names the provider can return and match. */
    locales: readonly Locale[];
  };
  search(query: SearchQuery, signal?: AbortSignal): Promise<PlaceResult[]>;
  /** Nearest first; empty array when nothing is around (open sea). */
  reverse(query: ReverseQuery, signal?: AbortSignal): Promise<PlaceResult[]>;
}

export interface RouteRequest {
  mode: TravelMode;
  stops: LngLat[]; // 2..25, in visiting order
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  /** Encoded polyline, precision 5, for this leg only. */
  polyline: string;
  /** true = straight-line estimate (provider down, no route, or a stop too far from the network). */
  estimated: boolean;
}

export interface RouteResult {
  provider: string; // 'osrm-fossgis' | 'valhalla-fossgis' | 'estimate' | 'fake'
  mode: TravelMode;
  quality: 'routed' | 'partial' | 'estimated';
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[]; // stops.length - 1
  /** Per stop: where the provider put it on the network and how far that is from the input. */
  snapped: Array<{ location: LngLat; offNetworkMeters: number; routable: boolean }>;
  attribution: string;
}

export interface RoutingProvider {
  readonly id: string;
  readonly capabilities: { modes: readonly TravelMode[]; maxStops: number };
  route(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult>;
}

export type ProviderErrorKind =
  | 'bad_request' // our bug or invalid user input (upstream 400 other than the cases below)
  | 'no_route' // OSRM NoRoute / NoTrips / NoTable, Valhalla 400 "no path"
  | 'unroutable_stop' // OSRM NoSegment, carries stopIndex
  | 'too_many_stops' // OSRM TooBig
  | 'rate_limited' // 429, or 403/503 from a throttling proxy
  | 'timeout'
  | 'unavailable' // network error, 5xx, circuit open
  | 'bad_response'; // 200 that fails the zod schema

export class ProviderError extends Error {
  readonly provider: string;
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly stopIndex?: number;
  constructor(provider: string, kind: ProviderErrorKind, message: string, options: { stopIndex?: number } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
    this.retryable = kind === 'timeout' || kind === 'unavailable';
    this.stopIndex = options.stopIndex;
  }
}
