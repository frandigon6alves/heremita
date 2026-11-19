import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { CACHE_TTL_MS, cacheKeys } from '../core/cache-keys.js';
import {
  ProviderError,
  providerPlaceSchema,
  type GeocodingProvider,
  type PlaceResult,
  type ReverseQuery,
  type SearchQuery,
} from '../core/contract.js';
import type { OutboundClient } from '../core/outbound.js';
import type { AdapterDeps } from '../core/providers.module.js';
import type { ProviderCacheService } from '../core/provider-cache.service.js';
import { parsePhotonAnswer, photonReverseUrl, photonSearchUrl } from './photon.mapper.js';

const placesSchema = z.array(providerPlaceSchema);

export interface PhotonGeocoderOptions {
  photonUrl: string;
  outbound: Pick<OutboundClient, 'get'>;
  cache: Pick<ProviderCacheService, 'remember'>;
  logger?: Pick<Logger, 'warn'>;
}

/** Search and reverse geocoding on Photon, answers cached under their canonical URL. */
export class PhotonGeocoder implements GeocodingProvider {
  readonly id = 'photon';
  private readonly logger: Pick<Logger, 'warn'>;

  constructor(private readonly options: PhotonGeocoderOptions) {
    this.logger = options.logger ?? new Logger(PhotonGeocoder.name);
  }

  search(query: SearchQuery, signal?: AbortSignal): Promise<PlaceResult[]> {
    const url = photonSearchUrl(this.options.photonUrl, query);
    return this.options.cache.remember(
      cacheKeys.geo(this.id, url),
      placesSchema,
      () => this.fetchPlaces(url, query.intent === 'autocomplete', signal),
      (places) =>
        places.length === 0 ? CACHE_TTL_MS.photonSearchEmpty : CACHE_TTL_MS.photonSearch,
    );
  }

  reverse(query: ReverseQuery, signal?: AbortSignal): Promise<PlaceResult[]> {
    const url = photonReverseUrl(this.options.photonUrl, query);
    return this.options.cache.remember(
      cacheKeys.geo(this.id, url),
      placesSchema,
      () => this.fetchPlaces(url, false, signal),
      () => CACHE_TTL_MS.photonReverse,
    );
  }

  private async fetchPlaces(
    url: string,
    autocomplete: boolean,
    signal: AbortSignal | undefined,
  ): Promise<PlaceResult[]> {
    const response = await this.options.outbound.get({ host: 'photon', url, autocomplete, signal });
    if (response.status !== 200) {
      throw new ProviderError(this.id, 'bad_request', `Photon answered ${response.status}`);
    }
    const answer = parsePhotonAnswer(response.body);
    if (!answer) {
      throw new ProviderError(this.id, 'bad_response', 'Photon answer is not a feature collection');
    }
    if (answer.dropped > 0) {
      this.logger.warn(`Photon answer had ${answer.dropped} invalid feature(s); dropped`);
    }
    return answer.places;
  }
}

/** Adapter factory for `ProvidersModule.forRoot({ photon })`. */
export function photonAdapter({ env, outbound, cache }: AdapterDeps): PhotonGeocoder {
  if (!env.PHOTON_URL) {
    throw new Error('PHOTON_URL is required when GEOCODING_PROVIDER=photon');
  }
  return new PhotonGeocoder({ photonUrl: env.PHOTON_URL, outbound, cache });
}
