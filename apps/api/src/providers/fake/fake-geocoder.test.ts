import { describe, expect, it } from 'vitest';
import { providerPlaceSchema, type SearchQuery } from '../core/contract.js';
import { FakeGeocoder } from './fake-geocoder.js';
import { GAZETTEER_KEYS } from './gazetteer.js';

const LISBOA = { lng: -9.1393, lat: 38.7223 };
const PARIS = { lng: 2.3522, lat: 48.8566 };

function query(overrides: Partial<SearchQuery>): SearchQuery {
  return { text: '', locale: 'pt-BR', intent: 'autocomplete', limit: 20, ...overrides };
}

describe('FakeGeocoder.search', () => {
  it('matches_a_substring_ignoring_case_and_diacritics', async () => {
    const results = await new FakeGeocoder().search(query({ text: 'BELEM' }));

    expect(results.map((place) => place.key)).toContain(GAZETTEER_KEYS.torreDeBelem);
    expect(results.map((place) => place.key)).toContain(GAZETTEER_KEYS.pasteisDeBelem);
  });

  it('answers_in_the_requested_locale', async () => {
    const geocoder = new FakeGeocoder();

    const [ptBr] = await geocoder.search(query({ text: 'torre de belem', locale: 'pt-BR' }));
    const [en] = await geocoder.search(query({ text: 'torre de belem', locale: 'en' }));

    expect(ptBr!.name).toBe('Torre de Belém');
    expect(en!.name).toBe('Tower of Belém');
  });

  it('answers_spanish_with_the_local_names_like_photon', async () => {
    const [es] = await new FakeGeocoder().search(query({ text: 'tower of belem', locale: 'es' }));

    expect(es!.name).toBe('Torre de Belém');
  });

  it('finds_a_place_by_its_name_in_the_other_locale', async () => {
    const results = await new FakeGeocoder().search(
      query({ text: 'tower of belem', locale: 'pt-BR' }),
    );

    expect(results.map((place) => place.key)).toEqual([GAZETTEER_KEYS.torreDeBelem]);
  });

  it('puts_prefix_matches_first', async () => {
    const results = await new FakeGeocoder().search(query({ text: 'museu' }));
    const prefixed = results.map((place) => place.name.toLowerCase().startsWith('museu'));

    expect(prefixed).toContain(true);
    expect(prefixed).toContain(false);
    expect(prefixed.lastIndexOf(true)).toBeLessThan(prefixed.indexOf(false));
  });

  it('orders_equal_matches_by_distance_to_the_bias', async () => {
    const geocoder = new FakeGeocoder();

    const [nearLisboa] = await geocoder.search(query({ text: 'museu', bias: { center: LISBOA } }));
    const [nearParis] = await geocoder.search(
      query({ text: 'musee', bias: { center: PARIS }, locale: 'en' }),
    );

    expect(nearLisboa!.address.city).toBe('Lisboa');
    expect(nearParis!.address.city).toBe('Paris');
  });

  it('filters_by_category_without_text', async () => {
    const results = await new FakeGeocoder().search(query({ categories: ['beach'] }));

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((place) => place.category === 'beach')).toBe(true);
  });

  it('keeps_only_places_inside_the_bbox', async () => {
    const within = { west: -9.3, south: 38.6, east: -9.0, north: 38.8 };

    const results = await new FakeGeocoder().search(query({ categories: ['sight'], within }));

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((place) => place.address.countryCode === 'PT')).toBe(true);
  });

  it('finds_barcelona_places_by_name', async () => {
    const geocoder = new FakeGeocoder();
    const keysFor = async (text: string) =>
      (await geocoder.search(query({ text, locale: 'es' }))).map((place) => place.key);

    expect(await keysFor('sagrada')).toEqual([GAZETTEER_KEYS.sagradaFamilia]);
    expect(await keysFor('barceloneta')).toEqual([GAZETTEER_KEYS.platjaDeLaBarceloneta]);
    expect(await keysFor('Barcelona')).toEqual([GAZETTEER_KEYS.museuDeCienciesNaturals]);
  });

  it('honours_the_limit', async () => {
    const results = await new FakeGeocoder().search(query({ text: 'a', limit: 2 }));

    expect(results).toHaveLength(2);
  });

  it('returns_nothing_for_an_unknown_name', async () => {
    expect(await new FakeGeocoder().search(query({ text: 'atlantis' }))).toEqual([]);
  });

  it('returns_valid_provider_places', async () => {
    const results = await new FakeGeocoder().search(query({ text: 'a' }));

    for (const place of results) {
      expect(providerPlaceSchema.parse(place)).toEqual(place);
    }
  });

  it('gives_the_same_answer_every_time', async () => {
    const geocoder = new FakeGeocoder();
    const ask = () => geocoder.search(query({ text: 'pra', bias: { center: LISBOA } }));

    expect(await ask()).toEqual(await ask());
  });
});

describe('FakeGeocoder.reverse', () => {
  it('returns_the_nearest_places_within_2_km_nearest_first', async () => {
    const torre = { lng: -9.2159288, lat: 38.691586 };

    const results = await new FakeGeocoder().reverse({
      point: torre,
      locale: 'pt-BR',
      radiusMeters: 150,
      limit: 5,
    });

    expect(results[0]!.key).toBe(GAZETTEER_KEYS.torreDeBelem);
    expect(results.length).toBeGreaterThan(1);
  });

  it('returns_nothing_in_the_open_sea', async () => {
    const results = await new FakeGeocoder().reverse({
      point: { lng: -30, lat: 35 },
      locale: 'en',
      radiusMeters: 150,
      limit: 5,
    });

    expect(results).toEqual([]);
  });
});

describe('FakeGeocoder.lookup', () => {
  it('resolves_known_keys_and_skips_unknown_ones', async () => {
    const results = await new FakeGeocoder().lookup([GAZETTEER_KEYS.masp, 'osm:N:1'], 'en');

    expect(results.map((place) => place.key)).toEqual([GAZETTEER_KEYS.masp]);
  });
});

describe('FakeGeocoder fault injection', () => {
  it('fails_every_call_with_the_configured_kind', async () => {
    const geocoder = new FakeGeocoder({ failWith: 'timeout' });

    await expect(geocoder.search(query({ text: 'museu' }))).rejects.toMatchObject({
      provider: 'fake',
      kind: 'timeout',
      retryable: true,
    });
    await expect(geocoder.lookup([GAZETTEER_KEYS.masp], 'en')).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
});
