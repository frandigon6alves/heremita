import { describe, expect, it } from 'vitest';
import { appleMapsLegUrl, googleMapsLegUrl } from './nav-links';

const castelo = { lng: -9.1334, lat: 38.7139 };
const graca = { lng: -9.1316, lat: 38.7163 };

describe('googleMapsLegUrl', () => {
  it('goes_from_origin_to_destination_in_the_legs_travel_mode', () => {
    const url = new URL(googleMapsLegUrl(castelo, graca, 'bike'));

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api: '1',
      origin: '38.7139,-9.1334',
      destination: '38.7163,-9.1316',
      travelmode: 'bicycling',
    });
  });

  it.each([
    ['walk', 'walking'],
    ['drive', 'driving'],
  ] as const)('maps_%s_to_%s', (mode, travelmode) => {
    expect(new URL(googleMapsLegUrl(castelo, graca, mode)).searchParams.get('travelmode')).toBe(
      travelmode,
    );
  });
});

describe('appleMapsLegUrl', () => {
  it.each([
    ['walk', 'walking'],
    ['bike', 'cycling'],
    ['drive', 'driving'],
  ] as const)('asks_for_%s_directions_as_%s', (mode, appleMode) => {
    const url = new URL(appleMapsLegUrl(castelo, graca, mode));

    expect(url.origin + url.pathname).toBe('https://maps.apple.com/directions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      source: '38.7139,-9.1334',
      destination: '38.7163,-9.1316',
      mode: appleMode,
    });
  });
});
