import type { LngLat } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { savedResponse } from '../../../test/routing/saved-responses.js';
import { ProviderError } from '../core/contract.js';
import { ESTIMATE_DETOUR_FACTOR } from '../core/estimates.js';
import { decodePolyline, haversineMeters } from '../core/geo.js';
import { osrmRouteUrl, routeFromOsrmBody } from './osrm.mapper.js';
import type { OsrmRouteOk } from './osrm.schemas.js';

/** Requested stops of the 3-stop Lisbon fixtures (Praça do Comércio → Rossio → Martim Moniz). */
const LISBON: LngLat[] = [
  { lng: -9.13663, lat: 38.70749 },
  { lng: -9.1326, lat: 38.7136 },
  { lng: -9.1306, lat: 38.7167 },
];
/** Third stop of `osrm_foot_28_partial_full`: in the Atlantic, snapped 1,875 km away. */
const ATLANTIC: LngLat = { lng: -30, lat: 38.7 };

function bodyOf(name: string): unknown {
  return savedResponse(name).body;
}

function failureOf(run: () => unknown): ProviderError {
  try {
    run();
  } catch (error) {
    if (error instanceof ProviderError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a ProviderError');
}

function closeTo(a: LngLat, b: LngLat): boolean {
  return Math.abs(a.lng - b.lng) <= 1.5e-5 && Math.abs(a.lat - b.lat) <= 1.5e-5;
}

describe('osrmRouteUrl', () => {
  it('builds_the_profile_path_and_fixed_query_with_six_decimals', () => {
    const url = osrmRouteUrl('https://routing.openstreetmap.de/', 'bike', [
      { lng: -9.1, lat: 38.7 },
      { lng: -9.123456789, lat: 38.7 },
    ]);

    expect(url).toBe(
      'https://routing.openstreetmap.de/routed-bike/route/v1/driving/-9.100000,38.700000;-9.123457,38.700000?overview=full&geometries=polyline&steps=false&generate_hints=false&alternatives=false',
    );
  });

  it('maps_each_mode_to_its_fossgis_profile', () => {
    const stops = LISBON.slice(0, 2);

    expect(osrmRouteUrl('https://x', 'walk', stops)).toContain('/routed-foot/route/v1/');
    expect(osrmRouteUrl('https://x', 'drive', stops)).toContain('/routed-car/route/v1/');
  });
});

describe('routeFromOsrmBody', () => {
  it('splits_the_geometry_into_one_polyline_per_leg_between_snapped_stops', () => {
    const route = routeFromOsrmBody('walk', LISBON, bodyOf('osrm_foot_01_polyline'));

    expect(route).toMatchObject({ provider: 'osrm-fossgis', mode: 'walk', quality: 'routed' });
    expect(route.legs.map((leg) => [leg.distanceMeters, leg.durationSeconds])).toEqual([
      [1047, 847],
      [813, 652],
    ]);
    expect(route.distanceMeters).toBe(1860);
    route.legs.forEach((leg, i) => {
      const points = decodePolyline(leg.polyline);
      expect(leg.estimated).toBe(false);
      expect(closeTo(points[0]!, route.snapped[i]!.location)).toBe(true);
      expect(closeTo(points.at(-1)!, route.snapped[i + 1]!.location)).toBe(true);
    });
    expect(route.snapped.map((stop) => stop.offNetworkMeters)).toEqual([1, 64, 28]);
  });

  it('splits_a_25_stop_route_into_24_legs', () => {
    const body = bodyOf('osrm_foot_15_route25') as OsrmRouteOk;
    const stops = body.waypoints.map(({ location: [lng, lat] }) => ({ lng, lat }));

    const route = routeFromOsrmBody('walk', stops, body);

    expect(route.legs).toHaveLength(24);
    expect(route.quality).toBe('routed');
  });

  it.each([
    ['bike', 'osrm_bike_01'],
    ['drive', 'osrm_car_01'],
  ] as const)('maps_a_%s_route', (mode, fixture) => {
    const route = routeFromOsrmBody(mode, LISBON, bodyOf(fixture));

    expect(route).toMatchObject({ mode, quality: 'routed' });
    expect(route.legs).toHaveLength(2);
  });

  it('stop_snapped_beyond_1km_on_foot_makes_its_leg_estimated', () => {
    const stops = [LISBON[0]!, LISBON[1]!, ATLANTIC];

    const route = routeFromOsrmBody('walk', stops, bodyOf('osrm_foot_28_partial_full'));

    expect(route.quality).toBe('partial');
    expect(route.snapped.map((stop) => stop.routable)).toEqual([true, true, false]);
    expect(route.legs[0]!.estimated).toBe(false);
    expect(route.legs[1]).toMatchObject({
      estimated: true,
      distanceMeters: Math.round(haversineMeters(stops[1]!, ATLANTIC) * ESTIMATE_DETOUR_FACTOR),
    });
    expect(decodePolyline(route.legs[1]!.polyline)).toHaveLength(2);
  });

  it.each([
    [999, 'walk', true],
    [1_001, 'walk', false],
    [1_001, 'bike', false],
    [2_999, 'drive', true],
    [3_001, 'drive', false],
  ] as const)('snap_of_%i_m_in_%s_is_routable_%s', (distance, mode, routable) => {
    const body = structuredClone(bodyOf('osrm_car_01')) as OsrmRouteOk;
    body.waypoints[1]!.distance = distance;

    const route = routeFromOsrmBody(mode, LISBON, body);

    expect(route.snapped[1]!.routable).toBe(routable);
    expect(route.legs.every((leg) => leg.estimated === !routable)).toBe(true);
  });

  it.each([
    ['osrm_foot_13_majority', 'no_route'],
    ['osrm_foot_10_radiuses', 'unroutable_stop'],
    ['osrm_foot_26_trip101', 'too_many_stops'],
    ['osrm_foot_23_invalid', 'bad_request'],
    ['osrm_foot_24_one_coord', 'bad_request'],
    ['osrm_car_04_exclude_ferry', 'bad_request'],
  ] as const)('maps_error_body_%s_to_%s', (fixture, kind) => {
    const error = failureOf(() => routeFromOsrmBody('walk', LISBON, bodyOf(fixture)));

    expect(error).toMatchObject({ provider: 'osrm-fossgis', kind });
  });

  it('names_the_stop_osrm_could_not_place', () => {
    const error = failureOf(() =>
      routeFromOsrmBody('walk', LISBON, bodyOf('osrm_foot_10_radiuses')),
    );

    expect(error.stopIndex).toBe(1);
  });

  it('treats_an_error_code_sent_with_status_200_as_an_error', () => {
    const error = failureOf(() =>
      routeFromOsrmBody('walk', LISBON, { code: 'NoRoute', message: 'Impossible route' }),
    );

    expect(error.kind).toBe('no_route');
  });

  it.each([
    ['ok_without_geometry', bodyOf('osrm_foot_09_ocean_stop')],
    ['html_page', null],
    ['ok_with_bad_coordinates', { code: 'Ok', routes: [], waypoints: [] }],
  ])('rejects_%s_as_bad_response', (_name, body) => {
    expect(failureOf(() => routeFromOsrmBody('walk', LISBON, body)).kind).toBe('bad_response');
  });

  it('rejects_waypoints_that_do_not_match_the_stops', () => {
    const error = failureOf(() =>
      routeFromOsrmBody('walk', LISBON.slice(0, 2), bodyOf('osrm_foot_01_polyline')),
    );

    expect(error.kind).toBe('bad_response');
  });

  it('rejects_a_waypoint_missing_from_the_geometry', () => {
    const body = structuredClone(bodyOf('osrm_foot_01_polyline')) as OsrmRouteOk;
    body.waypoints[1]!.location = [0, 0];

    expect(failureOf(() => routeFromOsrmBody('walk', LISBON, body)).kind).toBe('bad_response');
  });
});
