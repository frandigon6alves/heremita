import { Logger } from '@nestjs/common';
import {
  ProviderError,
  type GeocodingProvider,
  type PlaceResult,
  type SearchQuery,
} from '../providers/core/contract.js';

/** What the explicit-search fallback needs from its provider (Nominatim). */
export type PlaceSearcher = Pick<GeocodingProvider, 'id' | 'search'>;

/** Injection token of the fallback `PlaceSearcher`, or `null` when Nominatim is off. */
export const SEARCH_FALLBACK = Symbol('SEARCH_FALLBACK');

/** Case-, accent- and spacing-insensitive form of a name or query. */
function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Photon does not index Portuguese exonyms ("Torre Eiffel"): an explicit search
 * (`intent=submit`) whose results all miss the typed text asks the fallback once.
 * Never for autocomplete, never for category browsing without text.
 */
export function needsFallback(query: SearchQuery, places: readonly PlaceResult[]): boolean {
  const text = fold(query.text);
  return (
    query.intent === 'submit' &&
    text !== '' &&
    !places.some((place) => fold(place.name).includes(text))
  );
}

/** Fallback hits first (they match the text), then the primary ones; one entry per key. */
export function mergeResults(
  fallback: readonly PlaceResult[],
  primary: readonly PlaceResult[],
  limit: number,
): PlaceResult[] {
  const byKey = new Map<string, PlaceResult>();
  for (const place of [...fallback, ...primary]) {
    if (!byKey.has(place.key)) {
      byKey.set(place.key, place);
    }
  }
  return [...byKey.values()].slice(0, limit);
}

/**
 * Searches the primary geocoder, then the fallback when `needsFallback` says so.
 * A failing fallback leaves the primary results as they were.
 */
export async function searchWithFallback(
  primary: Pick<GeocodingProvider, 'search'>,
  fallback: PlaceSearcher | null,
  query: SearchQuery,
  logger: Pick<Logger, 'warn'> = new Logger('PlaceSearch'),
): Promise<PlaceResult[]> {
  const places = await primary.search(query);
  if (!fallback || !needsFallback(query, places)) {
    return places;
  }
  try {
    return mergeResults(await fallback.search(query), places, query.limit);
  } catch (error) {
    if (!(error instanceof ProviderError)) {
      throw error;
    }
    logger.warn(`Search fallback ${fallback.id} failed (${error.kind}); primary results kept`);
    return places;
  }
}
