import { describe, expect, it } from 'vitest';
import { categoryFromOsm } from './categories.js';

describe('categoryFromOsm', () => {
  it.each([
    ['tourism', 'attraction', 'sight'],
    ['man_made', 'bridge', 'sight'],
    ['bridge', 'yes', 'sight'],
    ['amenity', 'restaurant', 'food'],
    ['shop', 'bakery', 'cafe'],
    ['amenity', 'pub', 'nightlife'],
    ['building', 'hotel', 'lodging'],
    ['amenity', 'marketplace', 'shopping'],
    ['waterway', 'waterfall', 'nature'],
    ['natural', 'beach', 'beach'],
    ['tourism', 'museum', 'culture'],
    ['highway', 'bus_stop', 'transport'],
    ['craft', 'winery', 'activity'],
  ])('maps_exact_rule_%s_%s_to_%s', (key, value, category) => {
    expect(categoryFromOsm(key, value)).toBe(category);
  });

  it.each([
    ['historic', 'castle', 'sight'],
    ['tourism', 'yes', 'sight'],
    ['shop', 'books', 'shopping'],
    ['natural', 'peak', 'nature'],
    ['railway', 'station', 'transport'],
    ['aeroway', 'aerodrome', 'transport'],
    ['public_transport', 'station', 'transport'],
    ['aerialway', 'station', 'transport'],
    ['leisure', 'stadium', 'activity'],
    ['sport', 'surfing', 'activity'],
  ])('falls_back_to_the_key_default_for_%s_%s', (key, value, category) => {
    expect(categoryFromOsm(key, value)).toBe(category);
  });

  it.each([
    ['tourism', 'information'],
    ['leisure', 'playground'],
    ['natural', 'tree'],
    ['railway', 'level_crossing'],
  ])('lets_an_exact_rule_beat_a_generous_key_default_for_%s_%s', (key, value) => {
    expect(categoryFromOsm(key, value)).toBe('other');
  });

  it('maps_unknown_keys_to_other', () => {
    expect(categoryFromOsm('place', 'house')).toBe('other');
    expect(categoryFromOsm('highway', 'residential')).toBe('other');
  });

  it('maps_a_missing_key_to_other', () => {
    expect(categoryFromOsm(undefined, 'attraction')).toBe('other');
    expect(categoryFromOsm('', undefined)).toBe('other');
  });
});
