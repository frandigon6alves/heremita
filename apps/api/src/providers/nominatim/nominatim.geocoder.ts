import { Logger } from '@nestjs/common';
import type { Locale, PlaceKey } from '@heremita/shared';
import { z } from 'zod';
import { CACHE_TTL_MS, cacheKeys } from '../core/cache-keys.js';
import {
  ProviderError,
  providerPlaceSchema,
  type GeocodingProvider,
  type PlaceLookup,
  type PlaceResult,
  type SearchQuery,
} from '../core/contract.js';
import type { OutboundClient } from '../core/outbound.js';
import type { AdapterDeps } from '../core/providers.module.js';
import type { ProviderCacheService } from '../core/provider-cache.service.js';
import {
  nominatimLookupUrl,
  nominatimSearchUrl,
  parseNominatimAnswer,
} from './nominatim.mapper.js';

const placesSchema = z.array(providerPlaceSchema);

export interface NominatimGeocoderOptions {
  nominatimUrl: string;
  outbound: Pick<OutboundClient, 'get'>;
  cache: Pick<ProviderCacheService, 'remember'>;
  logger?: Pick<Logger, 'warn'>;
}

/**
 * Nominatim, opt-in only (`NOMINATIM_ENABLED`, OSMF policy): explicit-search
 * fallback and save-time lookup of keys the cache no longer holds. Never
 * autocomplete: `search` refuses it, and so does the outbound client.
 */
export class NominatimGeocoder implements PlaceLookup, Pick<GeocodingProvider, 'search'> {
  readonly id = 'nominatim';
  private readonly logger: Pick<Logger, 'warn'>;

  constructor(private readonly options: NominatimGeocoderOptions) {
    this.logger = options.logger ?? new Logger(NominatimGeocoder.name);
  }

  search(query: SearchQuery, signal?: AbortSignal): Promise<PlaceResult[]> {
    if (query.intent === 'autocomplete') {
      return Promise.reject(
        new ProviderError(this.id, 'bad_request', 'Nominatim forbids autocomplete'),
      );
    }
    const url = nominatimSearchUrl(this.options.nominatimUrl, query);
    return this.options.cache.remember(
      cacheKeys.geo(this.id, url),
      placesSchema,
      () => this.fetchPlaces(url, signal),
      () => CACHE_TTL_MS.nominatimSearch,
    );
  }

  lookup(keys: readonly PlaceKey[], locale: Locale, signal?: AbortSignal): Promise<PlaceResult[]> {
    if (keys.length === 0) {
      return Promise.resolve([]);
    }
    const url = nominatimLookupUrl(this.options.nominatimUrl, keys, locale);
    return this.options.cache.remember(
      cacheKeys.geo(this.id, url),
      placesSchema,
      () => this.fetchPlaces(url, signal),
      () => CACHE_TTL_MS.nominatimLookup,
    );
  }

  private async fetchPlaces(url: string, signal: AbortSignal | undefined): Promise<PlaceResult[]> {
    const response = await this.options.outbound.get({ host: 'nominatim', url, signal });
    if (response.status !== 200) {
      throw new ProviderError(this.id, 'bad_request', `Nominatim answered ${response.status}`);
    }
    const answer = parseNominatimAnswer(response.body);
    if (!answer) {
      throw new ProviderError(this.id, 'bad_response', 'Nominatim answer is not a list');
    }
    if (answer.dropped > 0) {
      this.logger.warn(`Nominatim answer had ${answer.dropped} invalid item(s); dropped`);
    }
    return answer.places;
  }
}

/** Adapter factory for `ProvidersModule.forRoot({ nominatim })`. */
export function nominatimAdapter({ env, outbound, cache }: AdapterDeps): NominatimGeocoder {
  if (!env.NOMINATIM_URL) {
    throw new Error('NOMINATIM_URL is required when NOMINATIM_ENABLED=true');
  }
  return new NominatimGeocoder({ nominatimUrl: env.NOMINATIM_URL, outbound, cache });
}
