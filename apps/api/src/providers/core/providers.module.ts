import { Logger, type DynamicModule, Module } from '@nestjs/common';
import { CLOCK, type Clock } from '../../core/clock/clock.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { FakeGeocoder } from '../fake/fake-geocoder.js';
import { FakeRouter } from '../fake/fake-router.js';
import {
  GEOCODING_PROVIDER,
  PLACE_LOOKUP,
  ROUTING_PROVIDER,
  type GeocodingProvider,
  type PlaceLookup,
  type RoutingProvider,
} from './contract.js';
import { OutboundClient } from './outbound.js';
import { PlaceResolver } from './place-resolver.js';
import { ProviderCacheService } from './provider-cache.service.js';

/** What a real adapter gets to build itself. */
export interface AdapterDeps {
  env: Env;
  outbound: OutboundClient;
  cache: ProviderCacheService;
}

/** Factories of the real adapters, registered by the modules that own them. */
export interface ProviderAdapters {
  photon?: (deps: AdapterDeps) => GeocodingProvider;
  /** Save-time `/lookup`; only built when `NOMINATIM_ENABLED=true`. */
  nominatim?: (deps: AdapterDeps) => PlaceLookup;
  osrm?: (deps: AdapterDeps) => RoutingProvider;
}

/** The environment selects an adapter this build does not register. */
export class ProviderSelectionError extends Error {
  override readonly name = 'ProviderSelectionError';
}

function required<T>(factory: T | undefined, setting: string): T {
  if (!factory) {
    throw new ProviderSelectionError(
      `${setting} selects an adapter this build does not register (ProvidersModule.forRoot)`,
    );
  }
  return factory;
}

export function selectGeocoder(
  env: Env,
  adapters: ProviderAdapters,
  deps: AdapterDeps,
): GeocodingProvider {
  if (env.GEOCODING_PROVIDER === 'fake') {
    return new FakeGeocoder();
  }
  return required(adapters.photon, 'GEOCODING_PROVIDER=photon')(deps);
}

export function selectRouter(
  env: Env,
  adapters: ProviderAdapters,
  deps: AdapterDeps,
): RoutingProvider {
  if (env.ROUTING_PROVIDER === 'fake') {
    return new FakeRouter();
  }
  return required(adapters.osrm, 'ROUTING_PROVIDER=osrm')(deps);
}

/**
 * Lookup source for keys the cache no longer holds: Nominatim iff enabled (never
 * otherwise, OSMF policy), else the geocoder's own lookup (the fake gazetteer), else none.
 */
export function selectPlaceLookup(
  env: Env,
  adapters: ProviderAdapters,
  deps: AdapterDeps,
  geocoder: GeocodingProvider,
): PlaceLookup | null {
  if (env.NOMINATIM_ENABLED) {
    return required(adapters.nominatim, 'NOMINATIM_ENABLED=true')(deps);
  }
  const { lookup } = geocoder;
  return lookup ? { lookup: lookup.bind(geocoder) } : null;
}

/**
 * Geocoding and routing for every feature module: the selected providers
 * (`GEOCODING_PROVIDER`, `ROUTING_PROVIDER`, `PLACE_LOOKUP`), the outbound
 * client, the provider cache and the place resolver. Fakes refused in
 * production are rejected earlier, by the env schema.
 */
@Module({})
export class ProvidersModule {
  static forRoot(adapters: ProviderAdapters = {}): DynamicModule {
    return {
      module: ProvidersModule,
      global: true,
      providers: [
        {
          provide: OutboundClient,
          inject: [ENV, CLOCK],
          useFactory: (env: Env, clock: Clock) =>
            new OutboundClient({
              publicSiteUrl: env.PUBLIC_SITE_URL,
              clock,
              logger: new Logger(OutboundClient.name),
            }),
        },
        ProviderCacheService,
        {
          provide: GEOCODING_PROVIDER,
          inject: [ENV, OutboundClient, ProviderCacheService],
          useFactory: (env: Env, outbound: OutboundClient, cache: ProviderCacheService) =>
            selectGeocoder(env, adapters, { env, outbound, cache }),
        },
        {
          provide: ROUTING_PROVIDER,
          inject: [ENV, OutboundClient, ProviderCacheService],
          useFactory: (env: Env, outbound: OutboundClient, cache: ProviderCacheService) =>
            selectRouter(env, adapters, { env, outbound, cache }),
        },
        {
          provide: PLACE_LOOKUP,
          inject: [ENV, OutboundClient, ProviderCacheService, GEOCODING_PROVIDER],
          useFactory: (
            env: Env,
            outbound: OutboundClient,
            cache: ProviderCacheService,
            geocoder: GeocodingProvider,
          ) => selectPlaceLookup(env, adapters, { env, outbound, cache }, geocoder),
        },
        PlaceResolver,
      ],
      exports: [
        OutboundClient,
        ProviderCacheService,
        GEOCODING_PROVIDER,
        ROUTING_PROVIDER,
        PLACE_LOOKUP,
        PlaceResolver,
      ],
    };
  }
}
