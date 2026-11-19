import type { Locale, PlaceKey } from '@heremita/shared';
import { categoryFromOsm } from '../core/categories.js';
import type { PlaceResult, SearchQuery } from '../core/contract.js';
import {
  nominatimListSchema,
  nominatimPlaceSchema,
  type NominatimPlace,
} from './nominatim-schemas.js';

const OSM_TYPE = { node: 'N', way: 'W', relation: 'R' } as const;

const AREA_TYPES = new Set([
  'country',
  'state',
  'region',
  'county',
  'municipality',
  'city',
  'town',
  'village',
  'hamlet',
  'city_district',
  'borough',
  'suburb',
  'quarter',
  'neighbourhood',
]);

function baseUrl(nominatimUrl: string): string {
  return nominatimUrl.replace(/\/+$/, '');
}

/** Canonical explicit-search URL (never autocomplete: OSMF policy). */
export function nominatimSearchUrl(nominatimUrl: string, query: SearchQuery): string {
  const params = new URLSearchParams({
    q: query.text.normalize('NFKC').trim().replace(/\s+/g, ' '),
    format: 'jsonv2',
    'accept-language': query.locale,
    limit: String(query.limit),
    addressdetails: '1',
  });
  return `${baseUrl(nominatimUrl)}/search?${params.toString()}`;
}

/** Canonical lookup URL; keys are sorted so the same set always gives the same URL. */
export function nominatimLookupUrl(
  nominatimUrl: string,
  keys: readonly PlaceKey[],
  locale: Locale,
): string {
  const ids = [...new Set(keys)].map((key) => key.slice('osm:'.length).replace(':', '')).sort();
  const params = new URLSearchParams({
    osm_ids: ids.join(','),
    format: 'jsonv2',
    'accept-language': locale,
    addressdetails: '1',
  });
  return `${baseUrl(nominatimUrl)}/lookup?${params.toString()}`;
}

function kindOf(place: NominatimPlace): PlaceResult['kind'] {
  if (place.addresstype === 'road') {
    return 'street';
  }
  if (AREA_TYPES.has(place.addresstype ?? '')) {
    return 'area';
  }
  return place.category === 'place' && place.type === 'house' ? 'address' : 'poi';
}

export function placeFromNominatim(place: NominatimPlace): PlaceResult {
  const osmType = OSM_TYPE[place.osm_type];
  const [first = place.display_name, ...rest] = place.display_name.split(', ');
  const name = place.name || first;
  const address = place.address ?? {};
  return {
    key: `osm:${osmType}:${place.osm_id}`,
    ref: { osmType, osmId: place.osm_id },
    name,
    label: (first === name ? rest : [first, ...rest]).join(', '),
    category: categoryFromOsm(place.category, place.type),
    kind: kindOf(place),
    osmKey: place.category,
    osmValue: place.type,
    location: { lng: place.lon, lat: place.lat },
    ...(place.boundingbox && {
      bbox: {
        south: place.boundingbox[0],
        north: place.boundingbox[1],
        west: place.boundingbox[2],
        east: place.boundingbox[3],
      },
    }),
    address: {
      houseNumber: address.house_number,
      street: address.road,
      district: address.suburb ?? address.neighbourhood ?? address.quarter,
      city: address.city ?? address.town ?? address.village ?? address.municipality,
      state: address.state,
      postcode: address.postcode,
      country: address.country,
      countryCode: address.country_code?.toUpperCase(),
    },
  };
}

export interface ParsedNominatimAnswer {
  places: PlaceResult[];
  /** Items that failed the schema (postcodes carry no OSM id) and were left out. */
  dropped: number;
}

/** `undefined` when the answer is not a list (an error object). */
export function parseNominatimAnswer(body: unknown): ParsedNominatimAnswer | undefined {
  const list = nominatimListSchema.safeParse(body);
  if (!list.success) {
    return undefined;
  }
  const places: PlaceResult[] = [];
  let dropped = 0;
  for (const raw of list.data) {
    const place = nominatimPlaceSchema.safeParse(raw);
    if (place.success) {
      places.push(placeFromNominatim(place.data));
    } else {
      dropped += 1;
    }
  }
  return { places, dropped };
}
