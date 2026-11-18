import { placeKeySchema } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { GAZETTEER, GAZETTEER_KEYS } from './gazetteer.js';

describe('GAZETTEER', () => {
  it('holds_about_sixty_places_in_each_of_the_four_cities', () => {
    const perCity = new Map<string, number>();
    for (const place of GAZETTEER) {
      perCity.set(place.city, (perCity.get(place.city) ?? 0) + 1);
    }

    expect(GAZETTEER.length).toBeGreaterThanOrEqual(55);
    expect([...perCity.keys()].sort()).toEqual(['lisboa', 'paris', 'rio-de-janeiro', 'sao-paulo']);
    expect([...perCity.values()].every((count) => count >= 10)).toBe(true);
  });

  it('uses_unique_place_keys_that_match_the_osm_ref', () => {
    const keys = GAZETTEER.map((place) => place.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const place of GAZETTEER) {
      expect(placeKeySchema.parse(place.key)).toBe(`osm:${place.ref.osmType}:${place.ref.osmId}`);
    }
  });

  it('names_every_place_in_both_locales', () => {
    for (const place of GAZETTEER) {
      expect(place.localized['pt-BR'].name.length).toBeGreaterThan(0);
      expect(place.localized.en.name.length).toBeGreaterThan(0);
    }
  });

  it('exports_a_key_constant_for_every_place', () => {
    expect(Object.values(GAZETTEER_KEYS).sort()).toEqual(
      GAZETTEER.map((place) => place.key).sort(),
    );
  });
});
