import { describe, expect, it } from 'vitest';
import { ProviderError, type PlaceResult } from '../providers/core/contract.js';
import { groundIdeas, namesMatch, type PlaceSearch } from './grounding.js';
import type { PlaceIdea } from './idea-generator.js';

const LISBON = { lng: -9.1393, lat: 38.7223 };
const PORTO = { lng: -8.6291, lat: 41.1579 };

function hit(key: string, name: string, overrides: Partial<PlaceResult> = {}): PlaceResult {
  return {
    key,
    ref: { osmType: 'N', osmId: Number(key.split(':')[2]) },
    name,
    label: name,
    category: 'sight',
    kind: 'poi',
    osmKey: 'tourism',
    osmValue: 'attraction',
    location: LISBON,
    address: {},
    ...overrides,
  };
}

function idea(name: string): PlaceIdea {
  return { name, category: 'sight', reason: `Because ${name}` };
}

/** A geocoder that answers from a table, recording what it was asked. */
function searchFrom(table: Record<string, PlaceResult[]>): PlaceSearch & { asked: string[] } {
  const asked: string[] = [];
  const search = (name: string) => {
    asked.push(name);
    return Promise.resolve(table[name] ?? []);
  };
  return Object.assign(search, { asked });
}

const input = (ideas: PlaceIdea[], count = 5, excludeKeys: string[] = []) => ({
  ideas,
  center: LISBON,
  count,
  excludeKeys: new Set(excludeKeys),
});

describe('namesMatch', () => {
  it.each([
    ['Torre de Belém', 'Torre de Belém', true],
    ['Torre de Belem', 'Torre de Belém', true],
    ['Museu Nacional do Azulejo', 'Museu Nacional do Azulejo - MNAz', true],
    ['Castelo de São Jorge', 'Castelo São Jorge', true],
    ['Jerónimos', 'Mosteiro dos Jerónimos', false],
    ['Beach', 'Beach Hotel', false],
    ['Ginjinha', 'Ginjinha', true],
    ['Torre de Belém', 'Pastéis de Belém', false],
    ['Torre de Belém', 'Belém', false],
    ['Museu Imaginário do Teste', 'Museu do Teatro e da Dança', false],
    ['Time Out Market Lisboa', 'Mercado da Ribeira', false],
    ['de la', 'de la', false],
  ])('%s_vs_%s_is_%s', (ideaName, hitName, expected) => {
    expect(namesMatch(ideaName, hitName)).toBe(expected);
  });
});

describe('groundIdeas', () => {
  it('keeps_the_first_matching_hit_with_the_idea_reason', async () => {
    const tower = hit('osm:N:1', 'Torre de Belém');
    const search = searchFrom({ 'Torre de Belém': [hit('osm:N:2', 'Belém'), tower] });

    const result = await groundIdeas(input([idea('Torre de Belém')]), search);

    expect(result).toEqual({
      items: [{ place: tower, reason: 'Because Torre de Belém' }],
      outcomes: [{ idea: idea('Torre de Belém'), outcome: 'kept', place: tower }],
      dropped: 0,
      failure: null,
    });
  });

  it('drops_ideas_without_a_name_match_far_away_areas_or_known_keys', async () => {
    const search = searchFrom({
      'Invented Museum': [hit('osm:N:3', 'Museu Nacional de Arte Antiga')],
      'Torre dos Clérigos': [hit('osm:N:4', 'Torre dos Clérigos', { location: PORTO })],
      Alfama: [hit('osm:R:5', 'Alfama', { kind: 'area' })],
      'Castelo de São Jorge': [hit('osm:N:6', 'Castelo de São Jorge')],
    });

    const result = await groundIdeas(
      input(
        ['Invented Museum', 'Torre dos Clérigos', 'Alfama', 'Castelo de São Jorge'].map(idea),
        5,
        ['osm:N:6'],
      ),
      search,
    );

    expect(result.items).toEqual([]);
    expect(result.dropped).toBe(4);
    expect(result.outcomes.map((entry) => entry.outcome)).toEqual([
      'no_match',
      'too_far',
      'area',
      'in_trip',
    ]);
  });

  it('never_serves_one_place_twice', async () => {
    const castle = hit('osm:N:7', 'Castelo de São Jorge');
    const search = searchFrom({
      'Castelo de São Jorge': [castle],
      'Castelo São Jorge': [castle],
    });

    const result = await groundIdeas(
      input([idea('Castelo de São Jorge'), idea('Castelo São Jorge')]),
      search,
    );

    expect(result.items.map((item) => item.place.key)).toEqual(['osm:N:7']);
    expect(result.dropped).toBe(1);
    expect(result.outcomes[1]?.outcome).toBe('duplicate');
  });

  it('stops_looking_up_once_count_places_are_kept', async () => {
    const search = searchFrom({
      Alpha: [hit('osm:N:11', 'Alpha')],
      Bravo: [hit('osm:N:12', 'Bravo')],
      Charlie: [hit('osm:N:13', 'Charlie')],
    });

    const result = await groundIdeas(
      input([idea('Alpha'), idea('Bravo'), idea('Charlie')], 2),
      search,
    );

    expect(result.items).toHaveLength(2);
    expect(search.asked).toEqual(['Alpha', 'Bravo']);
  });

  it('returns_what_it_kept_when_the_geocoder_fails', async () => {
    const failure = new ProviderError('photon', 'unavailable', 'down');
    let calls = 0;
    const search: PlaceSearch = (name) => {
      calls += 1;
      return calls === 1 ? Promise.resolve([hit('osm:N:21', name)]) : Promise.reject(failure);
    };

    const result = await groundIdeas(input([idea('First'), idea('Second'), idea('Third')]), search);

    expect(result.items).toHaveLength(1);
    expect(result.failure).toBe(failure);
    expect(calls).toBe(2);
  });

  it('rethrows_anything_that_is_not_a_provider_error', async () => {
    const search: PlaceSearch = () => Promise.reject(new TypeError('bug'));

    await expect(groundIdeas(input([idea('First')]), search)).rejects.toThrow(TypeError);
  });
});
