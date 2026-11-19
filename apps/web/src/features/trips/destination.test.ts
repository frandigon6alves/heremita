import type { PlaceResult } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { destinationAfterTyping, destinationFromPlace } from './destination';

const lisboa: PlaceResult = {
  key: 'osm:R:5400890',
  ref: { osmType: 'R', osmId: 5400890 },
  name: 'Lisboa',
  label: 'Lisboa, Portugal',
  category: 'other',
  kind: 'area',
  location: { lng: -9.1365, lat: 38.7077 },
  address: { country: 'Portugal', countryCode: 'pt' },
  placeId: null,
  rating: null,
};

describe('destinationFromPlace', () => {
  it('keeps_name_upper_cased_country_and_centre', () => {
    expect(destinationFromPlace(lisboa)).toEqual({
      name: 'Lisboa',
      countryCode: 'PT',
      center: { lng: -9.1365, lat: 38.7077 },
    });
  });

  it('drops_a_missing_or_malformed_country_code', () => {
    expect(destinationFromPlace({ ...lisboa, address: {} }).countryCode).toBeNull();
    expect(
      destinationFromPlace({ ...lisboa, address: { countryCode: 'PRT' } }).countryCode,
    ).toBeNull();
  });
});

describe('destinationAfterTyping', () => {
  const picked = destinationFromPlace(lisboa);

  it('clears_the_destination_when_the_text_is_empty', () => {
    expect(destinationAfterTyping(picked, '  ')).toBeNull();
  });

  it('keeps_a_pick_when_the_text_is_its_name', () => {
    expect(destinationAfterTyping(picked, 'Lisboa')).toBe(picked);
  });

  it('turns_other_text_into_a_destination_without_centre', () => {
    expect(destinationAfterTyping(picked, ' Lisbon coast ')).toEqual({
      name: 'Lisbon coast',
      countryCode: null,
      center: null,
    });
  });

  it('starts_a_free_text_destination_from_nothing', () => {
    expect(destinationAfterTyping(null, 'Chile')).toEqual({
      name: 'Chile',
      countryCode: null,
      center: null,
    });
  });
});
