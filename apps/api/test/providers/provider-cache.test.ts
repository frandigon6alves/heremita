import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseEnv } from '../../src/config/env.js';
import { FixedClock } from '../../src/core/clock/fixed-clock.js';
import { ApiProblem } from '../../src/core/http/api-problem.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { cachedLegSchema, cacheKeys, CACHE_TTL_MS } from '../../src/providers/core/cache-keys.js';
import { ProviderError, type PlaceLookup } from '../../src/providers/core/contract.js';
import { PlaceResolver } from '../../src/providers/core/place-resolver.js';
import { ProviderCacheService } from '../../src/providers/core/provider-cache.service.js';
import { FakeGeocoder } from '../../src/providers/fake/fake-geocoder.js';
import { GAZETTEER_KEYS } from '../../src/providers/fake/gazetteer.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

let database: TestDatabase;
let prisma: PrismaService;
let clock: FixedClock;
let cache: ProviderCacheService;
let keyCounter = 0;

const valueSchema = z.object({ n: z.number() });

/** Each test writes its own keys: no shared rows. */
function uniqueKey(label: string): string {
  keyCounter += 1;
  return `test:v1:fake:${label}:${keyCounter}`;
}

beforeAll(async () => {
  database = await createTestDatabase();
  prisma = new PrismaService(parseEnv({ ...process.env, DATABASE_URL: database.url }));
  clock = new FixedClock('2026-11-18T10:00:00.000Z');
  cache = new ProviderCacheService(prisma, clock);
});

afterAll(async () => {
  await prisma.$disconnect();
  await database.drop();
});

describe('ProviderCacheService', () => {
  it('returns_what_was_stored_until_it_expires', async () => {
    const key = uniqueKey('ttl');
    await cache.set(key, { n: 1 }, 60_000);

    const fresh = await cache.get(key, valueSchema);
    clock.advance(60_000);
    const expired = await cache.get(key, valueSchema);
    clock.advance(-60_000);

    expect(fresh).toEqual({ n: 1 });
    expect(expired).toBeUndefined();
  });

  it('treats_a_value_of_another_shape_as_a_miss', async () => {
    const key = uniqueKey('shape');
    await cache.set(key, { n: 'one' }, 60_000);

    expect(await cache.get(key, valueSchema)).toBeUndefined();
  });

  it('reads_many_keys_in_one_go_and_skips_misses', async () => {
    const [a, b, missing] = [uniqueKey('many'), uniqueKey('many'), uniqueKey('many')];
    await cache.setMany([
      { key: a, value: { n: 1 }, ttlMs: 60_000 },
      { key: b, value: { n: 2 }, ttlMs: 60_000 },
    ]);

    const found = await cache.getMany([a, b, missing], valueSchema);

    expect([...found.entries()].sort()).toEqual([
      [a, { n: 1 }],
      [b, { n: 2 }],
    ]);
  });

  it('replaces_an_existing_entry_on_set', async () => {
    const key = uniqueKey('upsert');
    await cache.set(key, { n: 1 }, 1_000);

    await cache.set(key, { n: 2 }, 60_000);
    clock.advance(30_000);
    const value = await cache.get(key, valueSchema);
    clock.advance(-30_000);

    expect(value).toEqual({ n: 2 });
  });

  it('stores_a_routed_leg_under_its_provider_keyed_entry', async () => {
    const from = { lng: -9.13661, lat: 38.70754 };
    const to = { lng: -9.1421, lat: 38.71081 };
    const leg = {
      distanceMeters: 812,
      durationSeconds: 640,
      polyline: '_ibkF~|ex@',
      snapped: [
        { location: from, offNetworkMeters: 3, routable: true },
        { location: to, offNetworkMeters: 5, routable: true },
      ],
    };
    await cache.set(cacheKeys.leg('fake', 'walk', from, to), leg, CACHE_TTL_MS.leg);

    expect(await cache.get(cacheKeys.leg('fake', 'walk', from, to), cachedLegSchema)).toEqual(leg);
    expect(
      await cache.get(cacheKeys.leg('osrm-fossgis', 'walk', from, to), cachedLegSchema),
    ).toBeUndefined();
  });
});

describe('ProviderCacheService.remember', () => {
  it('loads_once_and_serves_the_cached_value_afterwards', async () => {
    const key = uniqueKey('remember');
    const load = vi.fn(() => Promise.resolve({ n: 7 }));

    const first = await cache.remember(key, valueSchema, load, () => 60_000);
    const second = await cache.remember(key, valueSchema, load, () => 60_000);

    expect(first).toEqual({ n: 7 });
    expect(second).toEqual({ n: 7 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never_caches_a_failure', async () => {
    const key = uniqueKey('failure');
    const load = vi
      .fn<() => Promise<{ n: number }>>()
      .mockRejectedValueOnce(new ProviderError('fake', 'unavailable', 'down'))
      .mockResolvedValueOnce({ n: 8 });

    await expect(cache.remember(key, valueSchema, load, () => 60_000)).rejects.toThrow('down');
    const row = await prisma.providerCache.findUnique({ where: { key } });
    const retried = await cache.remember(key, valueSchema, load, () => 60_000);

    expect(row).toBeNull();
    expect(retried).toEqual({ n: 8 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares_one_load_between_concurrent_misses', async () => {
    const key = uniqueKey('flight');
    const load = vi.fn(() => Promise.resolve({ n: 9 }));

    const results = await Promise.all([
      cache.remember(key, valueSchema, load, () => 60_000),
      cache.remember(key, valueSchema, load, () => 60_000),
    ]);

    expect(results).toEqual([{ n: 9 }, { n: 9 }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('uses_the_ttl_the_value_asks_for', async () => {
    const key = uniqueKey('empty');

    await cache.remember(
      key,
      z.array(z.number()),
      () => Promise.resolve([]),
      (value) => (value.length === 0 ? CACHE_TTL_MS.photonSearchEmpty : CACHE_TTL_MS.photonSearch),
    );
    const row = await prisma.providerCache.findUniqueOrThrow({ where: { key } });

    expect(row.expiresAt.getTime() - clock.now().getTime()).toBe(60 * 60 * 1000);
  });
});

describe('PlaceResolver', () => {
  const geocoder = new FakeGeocoder();
  const fakeLookup: PlaceLookup = { lookup: (keys, locale) => geocoder.lookup(keys, locale) };
  const countingLookup = () => ({
    lookup: vi.fn<PlaceLookup['lookup']>((keys, locale) => geocoder.lookup(keys, locale)),
  });

  it('resolves_a_place_served_earlier_without_any_lookup', async () => {
    const [served] = await geocoder.lookup([GAZETTEER_KEYS.masp], 'pt-BR');
    const lookup = countingLookup();
    const resolver = new PlaceResolver(cache, lookup);
    await resolver.remember([served!]);

    const resolved = await resolver.resolve(GAZETTEER_KEYS.masp, 'pt-BR');

    expect(resolved).toEqual(served);
    expect(lookup.lookup).not.toHaveBeenCalled();
  });

  it('looks_up_a_cache_miss_and_remembers_it', async () => {
    const lookup = countingLookup();
    const resolver = new PlaceResolver(cache, lookup);

    const resolved = await resolver.resolve(GAZETTEER_KEYS.louvre, 'en');
    await resolver.resolve(GAZETTEER_KEYS.louvre, 'en');

    expect(resolved.key).toBe(GAZETTEER_KEYS.louvre);
    expect(lookup.lookup).toHaveBeenCalledTimes(1);
  });

  it('answers_503_geocoding_unavailable_without_a_lookup_source', async () => {
    const resolver = new PlaceResolver(cache, null);

    const error = await resolver
      .resolve(GAZETTEER_KEYS.notreDame, 'en')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiProblem);
    expect(error).toMatchObject({ code: 'geocoding_unavailable' });
    expect((error as ApiProblem).getStatus()).toBe(503);
  });

  it('answers_503_when_the_lookup_fails', async () => {
    const failing = new FakeGeocoder({ failWith: 'timeout' });
    const resolver = new PlaceResolver(cache, {
      lookup: (keys, locale) => failing.lookup(keys, locale),
    });

    await expect(resolver.resolve(GAZETTEER_KEYS.sacreCoeur, 'en')).rejects.toMatchObject({
      code: 'geocoding_unavailable',
    });
  });

  it('answers_503_when_the_lookup_does_not_know_the_key', async () => {
    const resolver = new PlaceResolver(cache, fakeLookup);

    await expect(resolver.resolve('osm:N:1', 'en')).rejects.toMatchObject({
      code: 'geocoding_unavailable',
    });
  });
});
