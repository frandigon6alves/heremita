import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { OutboundClient } from '../providers/core/outbound.js';
import { ProviderCacheService } from '../providers/core/provider-cache.service.js';
import { nominatimAdapter } from '../providers/nominatim/nominatim.geocoder.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';
import { SEARCH_FALLBACK, type PlaceSearcher } from './search-fallback.js';

@Module({
  controllers: [PlacesController],
  providers: [
    PlacesService,
    {
      provide: SEARCH_FALLBACK,
      inject: [ENV, OutboundClient, ProviderCacheService],
      useFactory: (
        env: Env,
        outbound: OutboundClient,
        cache: ProviderCacheService,
      ): PlaceSearcher | null =>
        env.NOMINATIM_ENABLED ? nominatimAdapter({ env, outbound, cache }) : null,
    },
  ],
  exports: [PlacesService],
})
export class PlacesModule {}
