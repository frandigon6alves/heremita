import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../core/clock/fixed-clock.js';
import { parseEnv } from '../../config/env.js';
import { FakeGeocoder } from '../fake/fake-geocoder.js';
import { FakeRouter } from '../fake/fake-router.js';
import type { GeocodingProvider, PlaceLookup, RoutingProvider } from './contract.js';
import { OutboundClient } from './outbound.js';
import type { ProviderCacheService } from './provider-cache.service.js';
import {
  ProviderSelectionError,
  selectGeocoder,
  selectPlaceLookup,
  selectRouter,
  type AdapterDeps,
  type ProviderAdapters,
} from './providers.module.js';

const DATABASE_URL = 'postgresql://heremita:heremita@localhost:5434/heremita';
const FAKE = { DATABASE_URL, GEOCODING_PROVIDER: 'fake', ROUTING_PROVIDER: 'fake' };
const REAL = {
  DATABASE_URL,
  GEOCODING_PROVIDER: 'photon',
  PHOTON_URL: 'https://photon.komoot.io',
  ROUTING_PROVIDER: 'osrm',
  OSRM_URL: 'https://routing.openstreetmap.de',
};

function deps(source: Record<string, string>): AdapterDeps {
  const env = parseEnv(source);
  return {
    env,
    outbound: new OutboundClient({
      publicSiteUrl: env.PUBLIC_SITE_URL,
      clock: new FixedClock('2026-11-18T10:00:00.000Z'),
      logger: { warn: () => undefined, error: () => undefined },
    }),
    cache: {} as ProviderCacheService,
  };
}

const photon = { id: 'photon' } as GeocodingProvider;
const osrm = { id: 'osrm-fossgis' } as RoutingProvider;
const nominatim: PlaceLookup = { lookup: () => Promise.resolve([]) };

describe('provider selection', () => {
  it('selects_the_fakes_when_the_env_says_fake', () => {
    const d = deps(FAKE);

    expect(selectGeocoder(d.env, {}, d)).toBeInstanceOf(FakeGeocoder);
    expect(selectRouter(d.env, {}, d)).toBeInstanceOf(FakeRouter);
  });

  it('builds_the_registered_real_adapters_with_their_deps', () => {
    const d = deps(REAL);
    const adapters: ProviderAdapters = { photon: vi.fn(() => photon), osrm: vi.fn(() => osrm) };

    expect(selectGeocoder(d.env, adapters, d)).toBe(photon);
    expect(selectRouter(d.env, adapters, d)).toBe(osrm);
    expect(adapters.photon).toHaveBeenCalledWith(d);
  });

  it('refuses_to_boot_when_the_selected_adapter_is_not_registered', () => {
    const d = deps(REAL);

    expect(() => selectGeocoder(d.env, {}, d)).toThrow(ProviderSelectionError);
    expect(() => selectRouter(d.env, {}, d)).toThrow(/ROUTING_PROVIDER=osrm/);
  });

  it('never_builds_nominatim_when_it_is_disabled', () => {
    const d = deps(REAL);
    const factory = vi.fn(() => nominatim);

    const lookup = selectPlaceLookup(d.env, { nominatim: factory }, d, photon);

    expect(lookup).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('uses_nominatim_for_lookups_when_enabled', () => {
    const d = deps({
      ...REAL,
      NOMINATIM_ENABLED: 'true',
      NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
    });

    expect(selectPlaceLookup(d.env, { nominatim: () => nominatim }, d, photon)).toBe(nominatim);
  });

  it('falls_back_to_the_fake_gazetteer_lookup_with_the_fake_geocoder', async () => {
    const d = deps(FAKE);

    const lookup = selectPlaceLookup(d.env, {}, d, new FakeGeocoder());

    expect(await lookup!.lookup(['osm:W:1370081491'], 'en')).toHaveLength(1);
  });
});
