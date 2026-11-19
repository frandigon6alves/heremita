import { describe, expect, it } from 'vitest';
import { estimateLeg, estimateRoute, routeQuality } from './estimates.js';
import { decodePolyline, haversineMeters } from './geo.js';

const BAIXA = { lng: -9.1366, lat: 38.7075 };
const CHIADO = { lng: -9.1421, lat: 38.7108 };
const BELEM = { lng: -9.2159, lat: 38.6916 };
const CASCAIS = { lng: -9.4215, lat: 38.6979 };

describe('estimateLeg', () => {
  it('stretches_the_straight_line_by_1_4', () => {
    const leg = estimateLeg('walk', BAIXA, CHIADO);

    expect(leg.distanceMeters).toBe(Math.round(haversineMeters(BAIXA, CHIADO) * 1.4));
    expect(leg.estimated).toBe(true);
  });

  it.each([
    ['walk', 4.6],
    ['bike', 15],
    ['drive', 30],
  ] as const)('times_a_%s_leg_at_%s_km_per_hour', (mode, kmh) => {
    const leg = estimateLeg(mode, BAIXA, BELEM);

    expect(leg.distanceMeters).toBeLessThan(10_000);
    expect(leg.durationSeconds).toBe(Math.round(leg.distanceMeters / (kmh / 3.6)));
  });

  it('drives_at_65_km_per_hour_beyond_10_km', () => {
    const leg = estimateLeg('drive', BAIXA, CASCAIS);

    expect(leg.distanceMeters).toBeGreaterThan(10_000);
    expect(leg.durationSeconds).toBe(Math.round(leg.distanceMeters / (65 / 3.6)));
  });

  it('walks_long_legs_at_walking_speed', () => {
    const leg = estimateLeg('walk', BAIXA, CASCAIS);

    expect(leg.durationSeconds).toBe(Math.round(leg.distanceMeters / (4.6 / 3.6)));
  });

  it('draws_a_two_point_line', () => {
    const points = decodePolyline(estimateLeg('walk', BAIXA, CHIADO).polyline);

    expect(points).toEqual([BAIXA, CHIADO]);
  });
});

describe('estimateRoute', () => {
  it('estimates_every_leg_and_marks_every_stop_unroutable', () => {
    const route = estimateRoute('bike', [BAIXA, CHIADO, BELEM]);

    expect(route.provider).toBe('estimate');
    expect(route.quality).toBe('estimated');
    expect(route.legs).toHaveLength(2);
    expect(route.legs.every((leg) => leg.estimated)).toBe(true);
    expect(route.snapped.map((stop) => stop.routable)).toEqual([false, false, false]);
    expect(route.distanceMeters).toBe(
      route.legs[0]!.distanceMeters + route.legs[1]!.distanceMeters,
    );
    expect(route.durationSeconds).toBe(
      route.legs[0]!.durationSeconds + route.legs[1]!.durationSeconds,
    );
  });
});

describe('routeQuality', () => {
  it('is_routed_when_no_leg_is_estimated', () => {
    expect(routeQuality([{ estimated: false }, { estimated: false }])).toBe('routed');
  });

  it('is_estimated_when_every_leg_is', () => {
    expect(routeQuality([{ estimated: true }, { estimated: true }])).toBe('estimated');
  });

  it('is_partial_when_some_legs_are', () => {
    expect(routeQuality([{ estimated: false }, { estimated: true }])).toBe('partial');
  });
});
