import { describe, expect, it } from 'vitest';
import {
  FakeOutbound,
  MemoryCache,
  upstreamFixture,
  WarningRecorder,
} from '../../../test/places/provider-doubles.js';
import { CACHE_TTL_MS } from '../core/cache-keys.js';
import type { SearchQuery } from '../core/contract.js';
import { NominatimGeocoder } from './nominatim.geocoder.js';

const NOMINATIM = 'https://nominatim.example.org';
const SEARCH: SearchQuery = { text: 'Torre Eiffel', locale: 'pt-BR', intent: 'submit', limit: 6 };

function build(outbound: FakeOutbound) {
  const cache = new MemoryCache();
  const logger = new WarningRecorder();
  const geocoder = new NominatimGeocoder({ nominatimUrl: NOMINATIM, outbound, cache, logger });
  return { geocoder, cache, logger };
}

function ok(name: string) {
  return { status: 200, body: upstreamFixture(name) };
}

describe('NominatimGeocoder', () => {
  it('caches_an_explicit_search_for_a_day', async () => {
    const outbound = new FakeOutbound(ok('nominatim_07_torre_eiffel'));
    const { geocoder, cache } = build(outbound);

    const places = await geocoder.search(SEARCH);

    expect(places.map((place) => place.key)).toEqual(['osm:W:5013364']);
    expect(outbound.requests.map(({ host, autocomplete }) => ({ host, autocomplete }))).toEqual([
      { host: 'nominatim', autocomplete: undefined },
    ]);
    expect([...cache.entries.values()].map((entry) => entry.ttlMs)).toEqual([
      CACHE_TTL_MS.nominatimSearch,
    ]);
  });

  it('never_sends_an_autocomplete_search', async () => {
    const outbound = new FakeOutbound(ok('nominatim_07_torre_eiffel'));
    const { geocoder } = build(outbound);

    await expect(geocoder.search({ ...SEARCH, intent: 'autocomplete' })).rejects.toMatchObject({
      provider: 'nominatim',
      kind: 'bad_request',
    });
    expect(outbound.requests).toHaveLength(0);
  });

  it('looks_up_keys_once_and_caches_them_for_thirty_days', async () => {
    const outbound = new FakeOutbound(ok('nominatim_03_lookup'));
    const { geocoder, cache } = build(outbound);
    const keys = ['osm:W:1370081491', 'osm:R:5400890', 'osm:N:4919986733'] as const;

    const first = await geocoder.lookup(keys, 'pt-BR');
    const again = await geocoder.lookup([...keys].reverse(), 'pt-BR');

    expect(first.map((place) => place.key)).toEqual(keys);
    expect(again).toEqual(first);
    expect(outbound.requests).toHaveLength(1);
    expect([...cache.entries.values()].map((entry) => entry.ttlMs)).toEqual([
      CACHE_TTL_MS.nominatimLookup,
    ]);
  });

  it('answers_an_empty_lookup_without_a_request', async () => {
    const outbound = new FakeOutbound(ok('nominatim_03_lookup'));
    const { geocoder } = build(outbound);

    await expect(geocoder.lookup([], 'en')).resolves.toEqual([]);
    expect(outbound.requests).toHaveLength(0);
  });

  it('fails_with_bad_request_on_a_nominatim_400_and_caches_nothing', async () => {
    const { geocoder, cache } = build(
      new FakeOutbound({ status: 400, body: upstreamFixture('nominatim_05_error') }),
    );

    await expect(geocoder.search(SEARCH)).rejects.toMatchObject({ kind: 'bad_request' });
    expect(cache.entries.size).toBe(0);
  });

  it('fails_with_bad_response_when_a_200_is_not_a_list', async () => {
    const { geocoder } = build(
      new FakeOutbound({ status: 200, body: upstreamFixture('nominatim_06_reverse_ocean') }),
    );

    await expect(geocoder.search(SEARCH)).rejects.toMatchObject({ kind: 'bad_response' });
  });

  it('warns_with_the_count_of_dropped_items', async () => {
    const body = upstreamFixture('nominatim_07_torre_eiffel') as unknown[];
    const { geocoder, logger } = build(new FakeOutbound({ status: 200, body: [...body, {}] }));

    await geocoder.search(SEARCH);

    expect(logger.warnings).toEqual(['Nominatim answer had 1 invalid item(s); dropped']);
  });
});
