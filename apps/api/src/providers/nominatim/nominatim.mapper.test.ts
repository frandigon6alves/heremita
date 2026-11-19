import { describe, expect, it } from 'vitest';
import { upstreamFixture } from '../../../test/places/provider-doubles.js';
import { providerPlaceSchema } from '../core/contract.js';
import {
  nominatimLookupUrl,
  nominatimSearchUrl,
  parseNominatimAnswer,
} from './nominatim.mapper.js';

const NOMINATIM = 'https://nominatim.example.org/';

function parsed(name: string) {
  const answer = parseNominatimAnswer(upstreamFixture(name));
  if (!answer) {
    throw new Error(`${name} is not a list`);
  }
  return answer;
}

describe('nominatimSearchUrl', () => {
  it('asks_jsonv2_with_address_details_in_the_caller_locale', () => {
    const url = new URL(
      nominatimSearchUrl(NOMINATIM, {
        text: ' Torre   Eiffel ',
        locale: 'pt-BR',
        intent: 'submit',
        limit: 6,
      }),
    );

    expect(url.origin + url.pathname).toBe('https://nominatim.example.org/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'Torre Eiffel',
      format: 'jsonv2',
      'accept-language': 'pt-BR',
      limit: '6',
      addressdetails: '1',
    });
  });
});

describe('nominatimLookupUrl', () => {
  it('lists_unique_sorted_osm_ids', () => {
    const url = new URL(
      nominatimLookupUrl(
        NOMINATIM,
        ['osm:W:1370081491', 'osm:R:5400890', 'osm:N:4919986733', 'osm:W:1370081491'],
        'en',
      ),
    );

    expect(url.pathname).toBe('/lookup');
    expect(url.searchParams.get('osm_ids')).toBe('N4919986733,R5400890,W1370081491');
    expect(url.searchParams.get('accept-language')).toBe('en');
  });
});

describe('parseNominatimAnswer', () => {
  it('maps_a_search_hit_with_string_coordinates_and_bbox', () => {
    const [tower] = parsed('nominatim_07_torre_eiffel').places;

    expect(tower).toMatchObject({
      key: 'osm:W:5013364',
      ref: { osmType: 'W', osmId: 5013364 },
      name: 'Torre Eiffel',
      category: 'sight',
      kind: 'poi',
      osmKey: 'man_made',
      osmValue: 'tower',
      location: { lng: 2.2945006, lat: 48.8582599 },
      bbox: { south: 48.8574753, north: 48.8590453, west: 2.2933119, east: 2.2956897 },
    });
    expect(tower?.label).toMatch(/^5, Avenue Anatole France, /);
  });

  it('maps_a_city_as_an_area_with_its_address', () => {
    const [munich] = parsed('nominatim_01_search_pt').places;

    expect(munich).toMatchObject({
      key: 'osm:R:62428',
      name: 'Munique',
      label: 'Baviera, Alemanha',
      kind: 'area',
      address: { city: 'Munique', state: 'Baviera', country: 'Alemanha', countryCode: 'DE' },
    });
  });

  it('maps_every_place_of_a_lookup', () => {
    const answer = parsed('nominatim_03_lookup');

    expect(answer.dropped).toBe(0);
    expect(answer.places.map((place) => place.key)).toEqual([
      'osm:W:1370081491',
      'osm:R:5400890',
      'osm:N:4919986733',
    ]);
    for (const place of answer.places) {
      expect(providerPlaceSchema.safeParse(place).success).toBe(true);
    }
  });

  it('drops_and_counts_items_without_an_osm_object', () => {
    const body = upstreamFixture('nominatim_07_torre_eiffel') as Record<string, unknown>[];
    const postcode = { ...body[0], osm_type: undefined, osm_id: undefined };

    const answer = parseNominatimAnswer([postcode, ...body]);

    expect(answer?.dropped).toBe(1);
    expect(answer?.places).toHaveLength(1);
  });

  it.each(['nominatim_05_error', 'nominatim_06_reverse_ocean'])(
    'rejects_the_non_list_body_%s',
    (name) => {
      expect(parseNominatimAnswer(upstreamFixture(name))).toBeUndefined();
    },
  );
});
