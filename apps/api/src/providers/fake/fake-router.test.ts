import { describe, expect, it } from 'vitest';
import { estimateLeg } from '../core/estimates.js';
import { decodePolyline, haversineMeters } from '../core/geo.js';
import { FakeRouter } from './fake-router.js';

const BAIXA = { lng: -9.1366, lat: 38.7075 };
const CHIADO = { lng: -9.1421, lat: 38.7108 };
const ALFAMA = { lng: -9.13, lat: 38.7115 };
const NORTH_POLE = { lng: 0, lat: 89 };

describe('FakeRouter', () => {
  it('routes_straight_legs_at_1_3_times_the_distance', async () => {
    const route = await new FakeRouter().route({ mode: 'walk', stops: [BAIXA, CHIADO] });

    const [leg] = route.legs;
    expect(leg!.distanceMeters).toBe(Math.round(haversineMeters(BAIXA, CHIADO) * 1.3));
    expect(leg!.durationSeconds).toBe(Math.round(leg!.distanceMeters / (4.6 / 3.6)));
    expect(leg!.estimated).toBe(false);
    expect(decodePolyline(leg!.polyline)).toEqual([BAIXA, CHIADO]);
  });

  it('reports_a_routed_fake_route', async () => {
    const route = await new FakeRouter().route({ mode: 'bike', stops: [BAIXA, CHIADO, ALFAMA] });

    expect(route.provider).toBe('fake');
    expect(route.quality).toBe('routed');
    expect(route.legs).toHaveLength(2);
    expect(route.snapped.every((stop) => stop.routable)).toBe(true);
    expect(route.distanceMeters).toBe(
      route.legs[0]!.distanceMeters + route.legs[1]!.distanceMeters,
    );
  });

  it('times_drive_legs_at_drive_speed', async () => {
    const route = await new FakeRouter().route({ mode: 'drive', stops: [BAIXA, CHIADO] });

    expect(route.legs[0]!.durationSeconds).toBe(
      Math.round(route.legs[0]!.distanceMeters / (30 / 3.6)),
    );
  });

  it('estimates_the_legs_of_a_stop_snapped_too_far', async () => {
    const route = await new FakeRouter().route({
      mode: 'walk',
      stops: [BAIXA, NORTH_POLE, CHIADO],
    });

    expect(route.quality).toBe('estimated');
    expect(route.snapped[1]!.routable).toBe(false);
    expect(route.snapped[1]!.offNetworkMeters).toBeGreaterThan(1_000);
    expect(route.legs[0]).toEqual(estimateLeg('walk', BAIXA, NORTH_POLE));
    expect(route.legs[1]).toEqual(estimateLeg('walk', NORTH_POLE, CHIADO));
  });

  it('is_partial_when_only_some_legs_are_estimated', async () => {
    const route = await new FakeRouter().route({
      mode: 'walk',
      stops: [BAIXA, CHIADO, NORTH_POLE],
    });

    expect(route.quality).toBe('partial');
    expect(route.legs.map((leg) => leg.estimated)).toEqual([false, true]);
  });

  it('refuses_more_than_25_stops', async () => {
    const stops = Array.from({ length: 26 }, (_, i) => ({ lng: -9.13 + i / 1000, lat: 38.71 }));

    await expect(new FakeRouter().route({ mode: 'walk', stops })).rejects.toMatchObject({
      kind: 'too_many_stops',
    });
  });

  it('refuses_fewer_than_2_stops', async () => {
    await expect(new FakeRouter().route({ mode: 'walk', stops: [BAIXA] })).rejects.toMatchObject({
      kind: 'bad_request',
    });
  });

  it('fails_with_the_injected_kind', async () => {
    const router = new FakeRouter({ failWith: 'unavailable' });

    await expect(router.route({ mode: 'walk', stops: [BAIXA, CHIADO] })).rejects.toMatchObject({
      provider: 'fake',
      kind: 'unavailable',
      retryable: true,
    });
  });
});
