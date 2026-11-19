import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { ConfigModule, ENV } from '../../src/config/config.module.js';
import { CoreModule } from '../../src/core/core.module.js';
import { PrismaModule } from '../../src/prisma/prisma.module.js';
import { parseEnv } from '../../src/config/env.js';
import {
  GEOCODING_PROVIDER,
  PLACE_LOOKUP,
  ROUTING_PROVIDER,
  type GeocodingProvider,
  type PlaceLookup,
} from '../../src/providers/core/contract.js';
import { PlaceResolver } from '../../src/providers/core/place-resolver.js';
import {
  ProviderSelectionError,
  ProvidersModule,
} from '../../src/providers/core/providers.module.js';
import { FakeGeocoder } from '../../src/providers/fake/fake-geocoder.js';
import { FakeRouter } from '../../src/providers/fake/fake-router.js';
import { OsrmRouter } from '../../src/providers/osrm/osrm-router.js';
import { PhotonGeocoder } from '../../src/providers/photon/photon.geocoder.js';
import { UNREACHABLE_DATABASE_URL } from '../support/app.js';

let context: INestApplicationContext | undefined;

async function boot(env: Record<string, string>): Promise<INestApplicationContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(parseEnv({ DATABASE_URL: UNREACHABLE_DATABASE_URL, NODE_ENV: 'test', ...env }))
    .compile();
  context = moduleRef;
  return moduleRef;
}

afterEach(async () => {
  await context?.close();
  context = undefined;
});

describe('ProvidersModule in the app', () => {
  it('wires_the_fakes_when_the_env_selects_them', async () => {
    const app = await boot({ GEOCODING_PROVIDER: 'fake', ROUTING_PROVIDER: 'fake' });

    expect(app.get(GEOCODING_PROVIDER)).toBeInstanceOf(FakeGeocoder);
    expect(app.get(ROUTING_PROVIDER)).toBeInstanceOf(FakeRouter);
    expect(app.get<PlaceLookup | null>(PLACE_LOOKUP)).not.toBeNull();
    expect(app.get(PlaceResolver)).toBeInstanceOf(PlaceResolver);
  });

  it('wires_photon_and_osrm_when_the_env_selects_them', async () => {
    const app = await boot({
      GEOCODING_PROVIDER: 'photon',
      PHOTON_URL: 'https://photon.komoot.io',
      ROUTING_PROVIDER: 'osrm',
      OSRM_URL: 'https://routing.openstreetmap.de',
    });

    expect(app.get(GEOCODING_PROVIDER)).toBeInstanceOf(PhotonGeocoder);
    expect(app.get(ROUTING_PROVIDER)).toBeInstanceOf(OsrmRouter);
    expect(app.get<PlaceLookup | null>(PLACE_LOOKUP)).toBeNull();
  });
});

describe('ProvidersModule with registered adapters', () => {
  const REAL = {
    GEOCODING_PROVIDER: 'photon',
    PHOTON_URL: 'https://photon.komoot.io',
    ROUTING_PROVIDER: 'fake',
  };
  const photon = { id: 'photon' } as GeocodingProvider;

  async function bootWith(
    env: Record<string, string>,
    adapters: Parameters<typeof ProvidersModule.forRoot>[0],
  ) {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule, CoreModule, ProvidersModule.forRoot(adapters)],
    })
      .overrideProvider(ENV)
      .useValue(parseEnv({ DATABASE_URL: UNREACHABLE_DATABASE_URL, NODE_ENV: 'test', ...env }))
      .compile();
    context = moduleRef;
    return moduleRef;
  }

  it('refuses_to_boot_with_a_real_provider_whose_adapter_is_not_registered', async () => {
    await expect(bootWith(REAL, {})).rejects.toThrow(ProviderSelectionError);
  });

  it('injects_the_registered_real_geocoder_and_no_lookup_while_nominatim_is_off', async () => {
    const nominatim: PlaceLookup = { lookup: () => Promise.resolve([]) };
    let built = false;
    const app = await bootWith(REAL, {
      photon: () => photon,
      nominatim: () => {
        built = true;
        return nominatim;
      },
    });

    expect(app.get(GEOCODING_PROVIDER)).toBe(photon);
    expect(app.get<PlaceLookup | null>(PLACE_LOOKUP)).toBeNull();
    expect(app.get(PlaceResolver)).toBeInstanceOf(PlaceResolver);
    expect(built).toBe(false);
  });

  it('injects_nominatim_as_the_lookup_when_enabled', async () => {
    const nominatim: PlaceLookup = { lookup: () => Promise.resolve([]) };

    const app = await bootWith(
      { ...REAL, NOMINATIM_ENABLED: 'true', NOMINATIM_URL: 'https://nominatim.openstreetmap.org' },
      { photon: () => photon, nominatim: () => nominatim },
    );

    expect(app.get(PLACE_LOOKUP)).toBe(nominatim);
  });
});
