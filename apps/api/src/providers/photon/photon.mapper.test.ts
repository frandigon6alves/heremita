import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { upstreamFixture } from '../../../test/places/provider-doubles.js';
import { providerPlaceSchema, type SearchQuery } from '../core/contract.js';
import {
  dedupePlaces,
  parsePhotonAnswer,
  photonLang,
  photonReverseUrl,
  photonSearchUrl,
} from './photon.mapper.js';

const PHOTON = 'https://photon.example.org/';

const ERROR_BODIES = [
  'photon_02_lang_pt',
  'photon_14_status',
  'photon_15_no_q',
  'photon_18_bad_lat',
  'photon_19_unknown_param',
];

function fixtureNames(dir: string, pattern: RegExp): string[] {
  return readdirSync(new URL(`../../../test/fixtures/upstream/${dir}/`, import.meta.url))
    .filter((file) => pattern.test(file))
    .map((file) => file.replace(/\.body$/, ''));
}

function search(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return { text: 'museu', locale: 'pt-BR', intent: 'autocomplete', limit: 6, ...overrides };
}

function parsed(name: string, dir?: string) {
  const answer = parsePhotonAnswer(upstreamFixture(name, dir));
  if (!answer) {
    throw new Error(`${name} is not a feature collection`);
  }
  return answer;
}

describe('photonLang', () => {
  it('maps_en_to_en_and_the_languages_photon_lacks_to_default', () => {
    expect(photonLang('en')).toBe('en');
    expect(photonLang('es')).toBe('default');
    expect(photonLang('pt-BR')).toBe('default');
  });
});

describe('photonSearchUrl', () => {
  it('collapses_whitespace_and_sets_lang_and_limit', () => {
    const url = new URL(photonSearchUrl(PHOTON, search({ text: '  Pastéis   de Belém ' })));

    expect(url.origin + url.pathname).toBe('https://photon.example.org/api/');
    expect(url.searchParams.get('q')).toBe('Pastéis de Belém');
    expect(url.searchParams.get('lang')).toBe('default');
    expect(url.searchParams.get('limit')).toBe('6');
  });

  it('asks_spanish_and_portuguese_with_one_url_so_they_share_a_cache_entry', () => {
    expect(photonSearchUrl(PHOTON, search({ locale: 'es' }))).toBe(
      photonSearchUrl(PHOTON, search({ locale: 'pt-BR' })),
    );
  });

  it('rounds_the_bias_to_four_decimals_and_clamps_zoom', () => {
    const url = new URL(
      photonSearchUrl(
        PHOTON,
        search({ locale: 'en', bias: { center: { lng: -9.203345, lat: 38.697521 }, zoom: 20 } }),
      ),
    );

    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('lat')).toBe('38.6975');
    expect(url.searchParams.get('lon')).toBe('-9.2033');
    expect(url.searchParams.get('zoom')).toBe('18');
  });

  it('writes_bbox_as_west_south_east_north', () => {
    const url = new URL(
      photonSearchUrl(
        PHOTON,
        search({ within: { west: -9.25, south: 38.68, east: -9.12, north: 38.75 } }),
      ),
    );

    expect(url.searchParams.get('bbox')).toBe('-9.2500,38.6800,-9.1200,38.7500');
  });

  it('turns_categories_into_include_filters_and_ignores_other', () => {
    const url = new URL(
      photonSearchUrl(PHOTON, search({ text: '', categories: ['nature', 'other'] })),
    );

    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.get('include')?.split(',')).toContain('osm.waterway.waterfall');
    expect(url.searchParams.get('include')).not.toContain('osm.natural.waterfall');
  });

  it('gives_equal_queries_equal_urls', () => {
    expect(photonSearchUrl(PHOTON, search({ text: 'museu  de arte' }))).toBe(
      photonSearchUrl(PHOTON, search({ text: ' museu de arte' })),
    );
  });
});

describe('photonReverseUrl', () => {
  it('sends_the_radius_in_kilometres', () => {
    const url = new URL(
      photonReverseUrl(PHOTON, {
        point: { lng: -43.21047, lat: -22.95192 },
        locale: 'pt-BR',
        radiusMeters: 150,
        limit: 5,
      }),
    );

    expect(url.pathname).toBe('/reverse');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: '-22.9519',
      lon: '-43.2105',
      radius: '0.15',
      limit: '5',
      lang: 'default',
    });
  });
});

describe('parsePhotonAnswer', () => {
  it('maps_a_museum_with_its_address_bbox_and_category', () => {
    const [masp] = parsed('photon_01_search_default').places;

    expect(masp).toEqual({
      key: 'osm:W:1370081491',
      ref: { osmType: 'W', osmId: 1370081491 },
      name: 'Museu de Arte de São Paulo',
      label: 'Av. Paulista 1578 · Bela Vista, São Paulo · Brasil',
      category: 'culture',
      kind: 'poi',
      osmKey: 'tourism',
      osmValue: 'museum',
      location: { lng: -46.6559677, lat: -23.5614961 },
      bbox: { west: -46.6563185, north: -23.5611808, east: -46.6556147, south: -23.5618152 },
      address: {
        houseNumber: '1578',
        street: 'Av. Paulista',
        district: 'Bela Vista',
        city: 'São Paulo',
        state: 'São Paulo',
        postcode: '01310-200',
        country: 'Brasil',
        countryCode: 'BR',
      },
    });
  });

  it('names_a_plain_address_street_and_number', () => {
    const [address] = parsed('photon_22_address').places;

    expect(address).toMatchObject({
      key: 'osm:N:4947759379',
      name: 'Avenida Paulista 1000',
      kind: 'address',
      label: 'Bela Vista, São Paulo · Brasil',
    });
  });

  it('answers_nothing_for_the_open_sea', () => {
    expect(parsed('photon_17_reverse_ocean')).toEqual({ places: [], dropped: 0 });
  });

  it('maps_every_saved_feature_collection_without_dropping_any', () => {
    const names = [
      ...fixtureNames('responses', /^photon_.*\.body$/)
        .filter((name) => !ERROR_BODIES.includes(name))
        .map((name) => ({ name, dir: 'responses' })),
      ...fixtureNames('responses-seed', /\.body$/).map((name) => ({ name, dir: 'responses-seed' })),
    ];

    expect(names.length).toBeGreaterThan(100);
    for (const { name, dir } of names) {
      const answer = parsed(name, dir);
      expect(answer.dropped, name).toBe(0);
      for (const place of answer.places) {
        expect(providerPlaceSchema.safeParse(place).success, `${name} ${place.key}`).toBe(true);
      }
    }
  });

  it('drops_and_counts_invalid_features_keeping_the_rest', () => {
    const body = upstreamFixture('photon_01_search_default') as { features: unknown[] };
    const answer = parsePhotonAnswer({
      ...body,
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [500, 0] }, properties: {} },
        ...body.features,
        'not a feature',
      ],
    });

    expect(answer?.dropped).toBe(2);
    expect(answer?.places).toHaveLength(body.features.length);
  });

  it('keeps_one_copy_of_a_feature_returned_twice', () => {
    const body = upstreamFixture('photon_01_search_default') as { features: unknown[] };
    const answer = parsePhotonAnswer({ ...body, features: [...body.features, body.features[0]] });

    expect(answer?.places.map((place) => place.key)).toEqual([
      'osm:W:1370081491',
      'osm:R:18874084',
      'osm:R:6711205',
    ]);
  });

  it.each(ERROR_BODIES)('rejects_the_non_collection_body_%s', (name) => {
    expect(parsePhotonAnswer(upstreamFixture(name))).toBeUndefined();
  });
});

describe('dedupePlaces', () => {
  it('keeps_the_first_occurrence_in_order', () => {
    const [a, b] = parsed('photon_01_search_default').places;
    if (!a || !b) {
      throw new Error('fixture changed');
    }
    expect(dedupePlaces([a, b, a, b])).toEqual([a, b]);
  });
});
