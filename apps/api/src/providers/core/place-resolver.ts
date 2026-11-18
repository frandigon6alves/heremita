import { Inject, Injectable } from '@nestjs/common';
import type { Locale, PlaceKey } from '@heremita/shared';
import { ApiProblem } from '../../core/http/api-problem.js';
import { CACHE_TTL_MS, cacheKeys } from './cache-keys.js';
import {
  PLACE_LOOKUP,
  ProviderError,
  providerPlaceSchema,
  type PlaceLookup,
  type PlaceResult,
} from './contract.js';
import { ProviderCacheService } from './provider-cache.service.js';

/**
 * Turns a place key the client sends (never names or coordinates) into the
 * place it was shown: the `place:v1:` entry written when search or reverse
 * served it, else a lookup (Nominatim iff enabled, or the fake gazetteer),
 * else 503 `geocoding_unavailable` so the client searches again.
 * Called before any transaction opens.
 */
@Injectable()
export class PlaceResolver {
  constructor(
    private readonly cache: ProviderCacheService,
    @Inject(PLACE_LOOKUP) private readonly lookup: PlaceLookup | null,
  ) {}

  /** Records places just served to a client, so saving one needs no upstream call. */
  async remember(places: readonly PlaceResult[]): Promise<void> {
    await this.cache.setMany(
      places.map((place) => ({
        key: cacheKeys.place(place.key),
        value: place,
        ttlMs: CACHE_TTL_MS.place,
      })),
    );
  }

  async resolve(key: PlaceKey, locale: Locale, signal?: AbortSignal): Promise<PlaceResult> {
    const cached = await this.cache.get(cacheKeys.place(key), providerPlaceSchema);
    if (cached) {
      return cached;
    }
    const found = await this.lookUp(key, locale, signal);
    if (!found) {
      throw new ApiProblem('geocoding_unavailable', 'The place could not be resolved; search for it again.');
    }
    await this.remember([found]);
    return found;
  }

  private async lookUp(
    key: PlaceKey,
    locale: Locale,
    signal: AbortSignal | undefined,
  ): Promise<PlaceResult | undefined> {
    if (!this.lookup) {
      return undefined;
    }
    try {
      const places = await this.lookup.lookup([key], locale, signal);
      return places.find((place) => place.key === key);
    } catch (error) {
      if (error instanceof ProviderError) {
        return undefined;
      }
      throw error;
    }
  }
}
