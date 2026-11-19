import { describe, expect, it } from 'vitest';
import { parseCoordinates } from './parse-coordinates';

describe('parseCoordinates', () => {
  it('reads_latitude_then_longitude_separated_by_a_comma', () => {
    expect(parseCoordinates('38.7139, -9.1334')).toEqual({ lat: 38.7139, lng: -9.1334 });
  });

  it('reads_a_space_separated_pair', () => {
    expect(parseCoordinates(' -23.5505   -46.6333 ')).toEqual({ lat: -23.5505, lng: -46.6333 });
  });

  it('reads_decimal_commas_when_the_pair_is_separated_by_a_semicolon', () => {
    expect(parseCoordinates('38,7139; -9,1334')).toEqual({ lat: 38.7139, lng: -9.1334 });
  });

  it('accepts_the_boundaries', () => {
    expect(parseCoordinates('90, 180')).toEqual({ lat: 90, lng: 180 });
    expect(parseCoordinates('-90, -180')).toEqual({ lat: -90, lng: -180 });
  });

  it.each(['', '38.7', '91, 0', '0, 181', 'abc, 1', '1, 2, 3', '1e2, 3', '38.7,'])(
    'rejects_%j',
    (text) => {
      expect(parseCoordinates(text)).toBeNull();
    },
  );
});
