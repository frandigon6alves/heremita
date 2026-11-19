import { describe, expect, it } from 'vitest';
import { cacheKeys } from '../providers/core/cache-keys.js';
import { legCacheKey, plannedLegs, type RouteStop } from './planned-legs.js';

const A: RouteStop = { id: 'a', location: { lng: -9.2, lat: 38.69 }, modeToNext: null };
const B: RouteStop = { id: 'b', location: { lng: -9.21, lat: 38.7 }, modeToNext: 'bike' };
const C: RouteStop = { id: 'c', location: { lng: -9.14, lat: 38.71 }, modeToNext: 'drive' };

describe('plannedLegs', () => {
  it('has_no_leg_for_zero_or_one_stop', () => {
    expect(plannedLegs([], 'walk')).toEqual([]);
    expect(plannedLegs([A], 'walk')).toEqual([]);
  });

  it('takes_the_stop_mode_else_the_day_mode_and_ignores_the_last_stop_mode', () => {
    expect(plannedLegs([A, B, C], 'walk')).toEqual([
      { fromStopId: 'a', toStopId: 'b', mode: 'walk', from: A.location, to: B.location },
      { fromStopId: 'b', toStopId: 'c', mode: 'bike', from: B.location, to: C.location },
    ]);
  });

  it('puts_every_leg_in_the_override_mode', () => {
    expect(plannedLegs([A, B, C], 'walk', 'drive').map((leg) => leg.mode)).toEqual([
      'drive',
      'drive',
    ]);
  });
});

describe('legCacheKey', () => {
  it('keys_a_leg_by_router_mode_and_ends', () => {
    const [leg] = plannedLegs([A, B], 'walk');

    expect(legCacheKey('fake', leg!)).toBe(cacheKeys.leg('fake', 'walk', A.location, B.location));
  });
});
