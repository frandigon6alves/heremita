import { describe, expect, it } from 'vitest';
import { cacheKeys, type CachedLeg } from '../providers/core/cache-keys.js';
import type { RouteStop } from '../routing/planned-legs.js';
import { keyedLegs, summariseDayRoute } from './route-summaries.js';

const A: RouteStop = { id: 'a', location: { lng: -9.2, lat: 38.69 }, modeToNext: null };
const B: RouteStop = { id: 'b', location: { lng: -9.21, lat: 38.7 }, modeToNext: 'bike' };
const C: RouteStop = { id: 'c', location: { lng: -9.14, lat: 38.71 }, modeToNext: 'drive' };

function cachedLeg(distanceMeters: number, durationSeconds: number): CachedLeg {
  const snapped = { location: A.location, offNetworkMeters: 0, routable: true };
  return { distanceMeters, durationSeconds, polyline: '', snapped: [snapped, snapped] };
}

describe('keyedLegs', () => {
  it('keys_each_leg_by_its_mode_and_ends', () => {
    expect(keyedLegs('fake', 'walk', [A, B, C]).map((leg) => leg.key)).toEqual([
      cacheKeys.leg('fake', 'walk', A.location, B.location),
      cacheKeys.leg('fake', 'bike', B.location, C.location),
    ]);
  });
});

describe('summariseDayRoute', () => {
  const legs = keyedLegs('fake', 'walk', [A, B, C]);

  it('totals_every_leg_when_all_are_cached', () => {
    const cached = new Map(legs.map((leg, index) => [leg.key, cachedLeg(100 * (index + 1), 60)]));

    const summary = summariseDayRoute('day', legs, cached);

    expect(summary.distanceMeters).toBe(300);
    expect(summary.durationSeconds).toBe(120);
    expect(summary.legs.map((leg) => leg?.estimated)).toEqual([false, false]);
  });

  it('leaves_a_missing_leg_null_and_the_totals_null', () => {
    const first = legs[0];
    const cached = new Map(first ? [[first.key, cachedLeg(100, 60)]] : []);

    const summary = summariseDayRoute('day', legs, cached);

    expect(summary.legs[0]).toMatchObject({ fromStopId: 'a', toStopId: 'b', distanceMeters: 100 });
    expect(summary.legs[1]).toBeNull();
    expect(summary.distanceMeters).toBeNull();
    expect(summary.durationSeconds).toBeNull();
  });

  it('answers_zero_totals_for_a_day_without_legs', () => {
    expect(summariseDayRoute('day', [], new Map())).toEqual({
      dayId: 'day',
      legs: [],
      distanceMeters: 0,
      durationSeconds: 0,
    });
  });
});
