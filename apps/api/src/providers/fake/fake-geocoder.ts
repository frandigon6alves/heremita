import type { BoundingBox, LngLat, Locale, PlaceKey } from '@heremita/shared';
import {
  ProviderError,
  type GeocodingProvider,
  type PlaceResult,
  type ProviderErrorKind,
  type ReverseQuery,
  type SearchQuery,
} from '../core/contract.js';
import { haversineMeters } from '../core/geo.js';
import { GAZETTEER, type GazetteerPlace } from './gazetteer.js';

/** Reverse geocoding of the fake answers with gazetteer places this close, nearest first. */
export const FAKE_REVERSE_RADIUS_METERS = 2_000;

export interface FakeProviderOptions {
  /** Every call fails with this kind. Test-only fault injection; never reachable from env or HTTP. */
  failWith?: ProviderErrorKind;
}

/** Case- and diacritic-insensitive form used for matching. */
function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function toResult(place: GazetteerPlace, locale: Locale): PlaceResult {
  const localized = place.localized[locale];
  return {
    key: place.key,
    ref: place.ref,
    name: localized.name,
    label: localized.label,
    category: place.category,
    kind: place.kind,
    osmKey: place.osmKey,
    osmValue: place.osmValue,
    location: place.location,
    ...(place.bbox ? { bbox: place.bbox } : {}),
    address: localized.address,
  };
}

/** Locale-independent order, so results never depend on the host's ICU data. */
function compareCodePoints(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function inside(box: BoundingBox, point: LngLat): boolean {
  return (
    point.lng >= box.west &&
    point.lng <= box.east &&
    point.lat >= box.south &&
    point.lat <= box.north
  );
}

/**
 * Deterministic geocoder over the gazetteer (real OSM keys, names and
 * coordinates) for tests and e2e. Never reads the clock, never random.
 */
export class FakeGeocoder implements GeocodingProvider {
  readonly id = 'fake';

  constructor(private readonly options: FakeProviderOptions = {}) {}

  search(query: SearchQuery): Promise<PlaceResult[]> {
    return this.answer(() => {
      const text = fold(query.text);
      const matches = GAZETTEER.flatMap((place) => {
        const shown = fold(place.localized[query.locale].name);
        const names = [shown, fold(place.localized.en.name), fold(place.localized['pt-BR'].name)];
        if (text !== '' && !names.some((name) => name.includes(text))) {
          return [];
        }
        if (query.categories && !query.categories.includes(place.category)) {
          return [];
        }
        if (query.within && !inside(query.within, place.location)) {
          return [];
        }
        return [
          {
            place,
            prefix: text !== '' && shown.startsWith(text),
            distance: query.bias ? haversineMeters(query.bias.center, place.location) : 0,
            name: shown,
          },
        ];
      });
      matches.sort(
        (a, b) =>
          Number(b.prefix) - Number(a.prefix) ||
          a.distance - b.distance ||
          compareCodePoints(a.name, b.name),
      );
      return matches.slice(0, query.limit).map((match) => toResult(match.place, query.locale));
    });
  }

  reverse(query: ReverseQuery): Promise<PlaceResult[]> {
    return this.answer(() =>
      GAZETTEER.map((place) => ({ place, distance: haversineMeters(query.point, place.location) }))
        .filter((candidate) => candidate.distance <= FAKE_REVERSE_RADIUS_METERS)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, query.limit)
        .map((candidate) => toResult(candidate.place, query.locale)),
    );
  }

  lookup(keys: readonly PlaceKey[], locale: Locale): Promise<PlaceResult[]> {
    return this.answer(() => {
      const wanted = new Set(keys);
      return GAZETTEER.filter((place) => wanted.has(place.key)).map((place) =>
        toResult(place, locale),
      );
    });
  }

  /** Settles like a real provider: a configured failure or anything `produce` throws rejects. */
  private answer(produce: () => PlaceResult[]): Promise<PlaceResult[]> {
    return new Promise((resolve) => {
      if (this.options.failWith) {
        throw new ProviderError(
          this.id,
          this.options.failWith,
          `fake geocoder: ${this.options.failWith}`,
        );
      }
      resolve(produce());
    });
  }
}
