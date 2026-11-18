import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline, haversineMeters } from './geo.js';

// The worked example of Google's encoded polyline documentation.
const GOOGLE_EXAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const GOOGLE_POINTS = [
  { lng: -120.2, lat: 38.5 },
  { lng: -120.95, lat: 40.7 },
  { lng: -126.453, lat: 43.252 },
];

describe('encodePolyline', () => {
  it('encodes_the_reference_example', () => {
    expect(encodePolyline(GOOGLE_POINTS)).toBe(GOOGLE_EXAMPLE);
  });

  it('encodes_no_points_as_an_empty_string', () => {
    expect(encodePolyline([])).toBe('');
  });

  it('rounds_to_five_decimals', () => {
    const [point] = decodePolyline(encodePolyline([{ lng: -9.1393366, lat: 38.7139281 }]));

    expect(point).toEqual({ lng: -9.13934, lat: 38.71393 });
  });
});

describe('decodePolyline', () => {
  it('decodes_the_reference_example', () => {
    expect(decodePolyline(GOOGLE_EXAMPLE)).toEqual(GOOGLE_POINTS);
  });

  it('round_trips_at_precision_six_without_overflow', () => {
    const points = [
      { lng: -179.999999, lat: -89.999999 },
      { lng: 179.999999, lat: 89.999999 },
    ];

    expect(decodePolyline(encodePolyline(points, 6), 6)).toEqual(points);
  });

  it('rejects_a_truncated_polyline', () => {
    expect(() => decodePolyline(GOOGLE_EXAMPLE.slice(0, 3))).toThrow(/truncated/);
  });
});

describe('haversineMeters', () => {
  it('is_zero_for_the_same_point', () => {
    expect(haversineMeters({ lng: -9.14, lat: 38.71 }, { lng: -9.14, lat: 38.71 })).toBe(0);
  });

  it('measures_one_degree_of_latitude_as_about_111_km', () => {
    const meters = haversineMeters({ lng: 0, lat: 0 }, { lng: 0, lat: 1 });

    expect(meters).toBeCloseTo(111_195, 0);
  });

  it('is_symmetric', () => {
    const lisbon = { lng: -9.1393, lat: 38.7223 };
    const paris = { lng: 2.3522, lat: 48.8566 };

    expect(haversineMeters(lisbon, paris)).toBeCloseTo(haversineMeters(paris, lisbon), 6);
    expect(haversineMeters(lisbon, paris)).toBeGreaterThan(1_450_000);
    expect(haversineMeters(lisbon, paris)).toBeLessThan(1_460_000);
  });
});
