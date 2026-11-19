import { describe, expect, it } from 'vitest';
import { boundsOf, decodePolyline5, toLngLat } from './geo';

describe('decodePolyline5', () => {
  it('decodes_the_reference_polyline_into_lng_lat_points', () => {
    const points = decodePolyline5('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(points).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('decodes_an_empty_string_to_no_points', () => {
    expect(decodePolyline5('')).toEqual([]);
  });

  it('decodes_a_single_point', () => {
    expect(decodePolyline5('_p~iF~ps|U')).toEqual([[-120.2, 38.5]]);
  });
});

describe('boundsOf', () => {
  it('returns_null_for_no_points', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('collapses_to_the_point_for_one_point', () => {
    expect(boundsOf([[-9.14, 38.71]])).toEqual([
      [-9.14, 38.71],
      [-9.14, 38.71],
    ]);
  });

  it('spans_west_south_to_east_north_for_many_points', () => {
    const bounds = boundsOf([
      [-9.14, 38.71],
      [-46.63, -23.55],
      [2.35, 48.86],
    ]);

    expect(bounds).toEqual([
      [-46.63, -23.55],
      [2.35, 48.86],
    ]);
  });
});

describe('toLngLat', () => {
  it('reads_a_geojson_position', () => {
    expect(toLngLat([2.35, 48.86])).toEqual([2.35, 48.86]);
  });

  it('rejects_a_position_without_two_numbers', () => {
    expect(toLngLat([2.35])).toBeNull();
  });
});
