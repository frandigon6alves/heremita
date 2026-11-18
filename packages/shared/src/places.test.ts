import { describe, expect, it } from 'vitest';
import { placeKeySchema, ratingSummarySchema, searchPlacesQuerySchema } from './places.js';

describe('searchPlacesQuerySchema', () => {
  it('applies_defaults', () => {
    const query = searchPlacesQuerySchema.parse({ q: ' belém ', locale: 'pt-BR' });

    expect(query).toEqual({ q: 'belém', locale: 'pt-BR', intent: 'autocomplete', limit: 6 });
  });

  it('rejects_a_query_shorter_than_3_characters_at_the_q_pointer', () => {
    const result = searchPlacesQuerySchema.safeParse({ q: 'ab', locale: 'en' });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['q']]);
  });

  it('accepts_an_empty_query_when_browsing_categories', () => {
    const query = searchPlacesQuerySchema.parse({ locale: 'en', categories: 'sight, food,sight' });

    expect(query.categories).toEqual(['sight', 'food']);
  });

  it('parses_near_and_within_from_comma_separated_numbers', () => {
    const query = searchPlacesQuerySchema.parse({
      q: 'torre',
      locale: 'en',
      near: '-9.1393,38.7223',
      within: '-9.23,38.69,-9.09,38.8',
      zoom: '14',
      limit: '20',
    });

    expect(query.near).toEqual({ lng: -9.1393, lat: 38.7223 });
    expect(query.within).toEqual({ west: -9.23, south: 38.69, east: -9.09, north: 38.8 });
    expect(query.zoom).toBe(14);
    expect(query.limit).toBe(20);
  });

  it.each([['-9.1'], ['a,b'], ['200,0'], ['1,,2']])('rejects_near_%s', (near) => {
    expect(searchPlacesQuerySchema.safeParse({ q: 'torre', locale: 'en', near }).success).toBe(
      false,
    );
  });

  it('rejects_an_unknown_category', () => {
    const result = searchPlacesQuerySchema.safeParse({ locale: 'en', categories: 'sight,zoo' });

    expect(result.success).toBe(false);
  });

  it('rejects_a_limit_above_20', () => {
    expect(
      searchPlacesQuerySchema.safeParse({ q: 'torre', locale: 'en', limit: '21' }).success,
    ).toBe(false);
  });
});

describe('placeKeySchema', () => {
  it.each(['osm:N:14183629101', 'osm:W:1370081491', 'osm:R:1'])('accepts_%s', (key) => {
    expect(placeKeySchema.safeParse(key).success).toBe(true);
  });

  it.each(['osm:X:1', 'osm:N:0', 'osm:N:01', 'N1'])('rejects_%s', (key) => {
    expect(placeKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('ratingSummarySchema', () => {
  it('rejects_an_average_below_the_minimum_count', () => {
    const summary = { count: 5, average: 4, distribution: [0, 0, 0, 5, 0] };

    expect(ratingSummarySchema.safeParse(summary).success).toBe(false);
  });

  it('requires_an_average_from_the_minimum_count', () => {
    expect(
      ratingSummarySchema.safeParse({ count: 6, average: null, distribution: null }).success,
    ).toBe(false);
    expect(
      ratingSummarySchema.safeParse({ count: 6, average: 4.5, distribution: [0, 0, 0, 3, 3] })
        .success,
    ).toBe(true);
  });
});
