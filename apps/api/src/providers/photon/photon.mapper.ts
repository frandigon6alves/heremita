import type { Locale, PlaceCategory } from '@heremita/shared';
import { roundCoordinate, GEO_KEY_DECIMALS } from '../core/cache-keys.js';
import { categoryFromOsm } from '../core/categories.js';
import type { PlaceResult, ReverseQuery, SearchQuery } from '../core/contract.js';
import { photonEnvelopeSchema, photonFeatureSchema, type PhotonFeature } from './photon-schemas.js';

/**
 * Category → Photon `include` filters (`osm.<key>[.<value>]`, comma = OR, a bare
 * key matches every value). Waterfalls are `waterway=waterfall` in OSM:
 * `osm.natural.waterfall` only matches mis-tagged objects (measured 2026-11-18).
 */
export const PHOTON_INCLUDE: Readonly<Record<Exclude<PlaceCategory, 'other'>, readonly string[]>> =
  {
    sight: [
      'osm.tourism.attraction',
      'osm.tourism.viewpoint',
      'osm.tourism.artwork',
      'osm.historic',
      'osm.amenity.place_of_worship',
      'osm.man_made.tower',
      'osm.man_made.lighthouse',
    ],
    food: ['osm.amenity.restaurant', 'osm.amenity.fast_food', 'osm.amenity.food_court'],
    cafe: [
      'osm.amenity.cafe',
      'osm.amenity.ice_cream',
      'osm.shop.bakery',
      'osm.shop.pastry',
      'osm.shop.coffee',
    ],
    nightlife: [
      'osm.amenity.bar',
      'osm.amenity.pub',
      'osm.amenity.nightclub',
      'osm.amenity.biergarten',
    ],
    lodging: [
      'osm.tourism.hotel',
      'osm.tourism.hostel',
      'osm.tourism.guest_house',
      'osm.tourism.motel',
      'osm.tourism.apartment',
      'osm.tourism.camp_site',
    ],
    shopping: ['osm.shop', 'osm.amenity.marketplace'],
    nature: [
      'osm.leisure.park',
      'osm.leisure.garden',
      'osm.leisure.nature_reserve',
      'osm.natural.peak',
      'osm.waterway.waterfall',
      'osm.boundary.national_park',
    ],
    beach: ['osm.natural.beach', 'osm.leisure.beach_resort'],
    culture: [
      'osm.tourism.museum',
      'osm.tourism.gallery',
      'osm.amenity.theatre',
      'osm.amenity.arts_centre',
      'osm.amenity.cinema',
      'osm.amenity.library',
    ],
    transport: [
      'osm.railway.station',
      'osm.amenity.bus_station',
      'osm.amenity.ferry_terminal',
      'osm.aeroway.aerodrome',
      'osm.railway.tram_stop',
    ],
    activity: [
      'osm.tourism.theme_park',
      'osm.tourism.zoo',
      'osm.tourism.aquarium',
      'osm.leisure.water_park',
      'osm.leisure.stadium',
      'osm.leisure.sports_centre',
    ],
  };

/** Photon's bias zoom range; outside it the bias radius stops changing. */
const PHOTON_ZOOM = { min: 3, max: 18 } as const;

/** Photon speaks `default` (local names), `de`, `en`, `fr`; `lang=pt` is a 400. */
export function photonLang(locale: Locale): 'default' | 'en' {
  return locale === 'en' ? 'en' : 'default';
}

function coordinate(value: number): string {
  return roundCoordinate(value, GEO_KEY_DECIMALS);
}

function baseUrl(photonUrl: string): string {
  return photonUrl.replace(/\/+$/, '');
}

/** Canonical search URL: the same query always gives the same URL (it is the cache key). */
export function photonSearchUrl(photonUrl: string, query: SearchQuery): string {
  const params = new URLSearchParams();
  const text = query.text.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (text) {
    params.set('q', text);
  }
  params.set('lang', photonLang(query.locale));
  params.set('limit', String(query.limit));
  if (query.bias) {
    params.set('lat', coordinate(query.bias.center.lat));
    params.set('lon', coordinate(query.bias.center.lng));
    if (query.bias.zoom !== undefined) {
      const zoom = Math.min(
        PHOTON_ZOOM.max,
        Math.max(PHOTON_ZOOM.min, Math.round(query.bias.zoom)),
      );
      params.set('zoom', String(zoom));
    }
  }
  if (query.within) {
    const { west, south, east, north } = query.within;
    params.set('bbox', [west, south, east, north].map(coordinate).join(','));
  }
  const include = (query.categories ?? []).flatMap((category) =>
    category === 'other' ? [] : PHOTON_INCLUDE[category],
  );
  if (include.length > 0) {
    params.set('include', include.join(','));
  }
  return `${baseUrl(photonUrl)}/api/?${params.toString()}`;
}

/** Canonical reverse URL; Photon's `radius` is in kilometres. */
export function photonReverseUrl(photonUrl: string, query: ReverseQuery): string {
  const params = new URLSearchParams({
    lat: coordinate(query.point.lat),
    lon: coordinate(query.point.lng),
    radius: String(query.radiusMeters / 1000),
    limit: String(query.limit),
    lang: photonLang(query.locale),
  });
  return `${baseUrl(photonUrl)}/reverse?${params.toString()}`;
}

const KIND_BY_LAYER: Readonly<Record<string, PlaceResult['kind']>> = {
  street: 'street',
  locality: 'area',
  district: 'area',
  city: 'area',
  county: 'area',
  state: 'area',
  country: 'area',
};

function kindOf(properties: PhotonFeature['properties']): PlaceResult['kind'] {
  const byLayer = KIND_BY_LAYER[properties.type ?? ''];
  if (byLayer) {
    return byLayer;
  }
  return properties.osm_key === 'place' && properties.osm_value === 'house' ? 'address' : 'poi';
}

export function placeFromPhoton(feature: PhotonFeature): PlaceResult {
  const p = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
  const name = p.name ?? (streetLine || p.city || p.country || `${lat}, ${lng}`);
  const locality = [p.district, p.city].filter((part) => part && part !== name).join(', ');
  const label = [
    streetLine === name ? '' : streetLine,
    locality,
    p.country === name ? '' : p.country,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    key: `osm:${p.osm_type}:${p.osm_id}`,
    ref: { osmType: p.osm_type, osmId: p.osm_id },
    name,
    label,
    category: categoryFromOsm(p.osm_key, p.osm_value),
    kind: kindOf(p),
    osmKey: p.osm_key,
    osmValue: p.osm_value,
    location: { lng, lat },
    ...(p.extent && {
      bbox: { west: p.extent[0], north: p.extent[1], east: p.extent[2], south: p.extent[3] },
    }),
    address: {
      houseNumber: p.housenumber,
      street: p.street,
      district: p.district,
      city: p.city,
      state: p.state,
      postcode: p.postcode,
      country: p.country,
      countryCode: p.countrycode?.toUpperCase(),
    },
  };
}

/** Photon returns the same object twice in one answer at times (measured), so keep the first. */
export function dedupePlaces(places: readonly PlaceResult[]): PlaceResult[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    if (seen.has(place.key)) {
      return false;
    }
    seen.add(place.key);
    return true;
  });
}

export interface ParsedPhotonAnswer {
  places: PlaceResult[];
  /** Features that failed the schema and were left out. */
  dropped: number;
}

/** `undefined` when the envelope itself is not a Photon feature collection. */
export function parsePhotonAnswer(body: unknown): ParsedPhotonAnswer | undefined {
  const envelope = photonEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return undefined;
  }
  const places: PlaceResult[] = [];
  let dropped = 0;
  for (const raw of envelope.data.features) {
    const feature = photonFeatureSchema.safeParse(raw);
    if (feature.success) {
      places.push(placeFromPhoton(feature.data));
    } else {
      dropped += 1;
    }
  }
  return { places: dedupePlaces(places), dropped };
}
