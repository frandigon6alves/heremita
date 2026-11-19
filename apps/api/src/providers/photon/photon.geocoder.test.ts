import { describe, expect, it } from 'vitest';
import {
  FakeOutbound,
  MemoryCache,
  upstreamFixture,
  WarningRecorder,
} from '../../../test/places/provider-doubles.js';
import { CACHE_TTL_MS } from '../core/cache-keys.js';
import { ProviderError, type ReverseQuery, type SearchQuery } from '../core/contract.js';
import { PhotonGeocoder } from './photon.geocoder.js';

const PHOTON = 'https://photon.example.org';

const SEARCH: SearchQuery = { text: 'museu de arte', locale: 'pt-BR', intent: 'submit', limit: 6 };
const REVERSE: ReverseQuery = {
  point: { lng: -43.2105, lat: -22.9519 },
  locale: 'pt-BR',
  radiusMeters: 150,
  limit: 5,
};

function build(outbound: FakeOutbound) {
  const cache = new MemoryCache();
  const logger = new WarningRecorder();
  const geocoder = new PhotonGeocoder({ photonUrl: PHOTON, outbound, cache, logger });
  return { geocoder, cache, logger };
}

function ok(name: string) {
  return { status: 200, body: upstreamFixture(name) };
}

describe('PhotonGeocoder', () => {
  it('caches_a_search_under_its_canonical_url_for_a_day', async () => {
    const outbound = new FakeOutbound(ok('photon_01_search_default'));
    const { geocoder, cache } = build(outbound);

    const places = await geocoder.search(SEARCH);

    expect(places.map((place) => place.key)).toContain('osm:W:1370081491');
    const [request] = outbound.requests;
    expect(request?.host).toBe('photon');
    expect([...cache.entries]).toEqual([
      [`geo:v1:photon:${request?.url}`, { value: places, ttlMs: CACHE_TTL_MS.photonSearch }],
    ]);
  });

  it('caches_an_empty_search_for_an_hour', async () => {
    const { geocoder, cache } = build(new FakeOutbound(ok('photon_27_torre_eiffel_bbox')));

    await expect(geocoder.search(SEARCH)).resolves.toEqual([]);

    expect([...cache.entries.values()].map((entry) => entry.ttlMs)).toEqual([
      CACHE_TTL_MS.photonSearchEmpty,
    ]);
  });

  it('serves_a_repeated_search_from_the_cache', async () => {
    const outbound = new FakeOutbound(ok('photon_01_search_default'));
    const { geocoder } = build(outbound);

    const first = await geocoder.search(SEARCH);
    const second = await geocoder.search(SEARCH);

    expect(second).toEqual(first);
    expect(outbound.requests).toHaveLength(1);
  });

  it('marks_only_autocomplete_searches_as_autocomplete', async () => {
    const outbound = new FakeOutbound(ok('photon_01_search_default'));
    const { geocoder } = build(outbound);

    await geocoder.search({ ...SEARCH, intent: 'autocomplete', text: 'masp' });
    await geocoder.search(SEARCH);
    await geocoder.reverse(REVERSE);

    expect(outbound.requests.map((request) => request.autocomplete)).toEqual([true, false, false]);
  });

  it('caches_a_reverse_answer_for_seven_days', async () => {
    const outbound = new FakeOutbound(ok('photon_12_reverse'));
    const { geocoder, cache } = build(outbound);

    const places = await geocoder.reverse(REVERSE);

    expect(places).toHaveLength(1);
    expect(outbound.requests[0]?.url).toBe(
      `${PHOTON}/reverse?lat=-22.9519&lon=-43.2105&radius=0.15&limit=5&lang=default`,
    );
    expect([...cache.entries.values()].map((entry) => entry.ttlMs)).toEqual([
      CACHE_TTL_MS.photonReverse,
    ]);
  });

  it('fails_with_bad_request_on_a_photon_400_and_caches_nothing', async () => {
    const { geocoder, cache } = build(
      new FakeOutbound({ status: 400, body: upstreamFixture('photon_02_lang_pt') }),
    );

    const failure = geocoder.search(SEARCH);

    await expect(failure).rejects.toBeInstanceOf(ProviderError);
    await expect(failure).rejects.toMatchObject({ provider: 'photon', kind: 'bad_request' });
    expect(cache.entries.size).toBe(0);
  });

  it('fails_with_bad_response_when_a_200_is_not_a_feature_collection', async () => {
    const { geocoder, cache } = build(
      new FakeOutbound({ status: 200, body: upstreamFixture('photon_14_status') }),
    );

    await expect(geocoder.search(SEARCH)).rejects.toMatchObject({ kind: 'bad_response' });
    expect(cache.entries.size).toBe(0);
  });

  it('warns_with_the_count_of_dropped_features', async () => {
    const body = upstreamFixture('photon_01_search_default') as { features: unknown[] };
    const { geocoder, logger } = build(
      new FakeOutbound({ status: 200, body: { ...body, features: [...body.features, {}] } }),
    );

    const places = await geocoder.search(SEARCH);

    expect(places).toHaveLength(3);
    expect(logger.warnings).toEqual(['Photon answer had 1 invalid feature(s); dropped']);
  });

  it('passes_provider_errors_through', async () => {
    const outbound = {
      get: () =>
        Promise.reject(
          new ProviderError('photon', 'rate_limited', 'busy', { retryAfterSeconds: 1 }),
        ),
    };
    const geocoder = new PhotonGeocoder({ photonUrl: PHOTON, outbound, cache: new MemoryCache() });

    await expect(geocoder.search(SEARCH)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 1,
    });
  });
});
