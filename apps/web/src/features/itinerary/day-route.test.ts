import type { DayRouteSummary, LngLat } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { dayRouteLines, dayRouteView, estimateLeg, type DayRouteInput } from './day-route';
import { buildDayRoute, buildPlan, dayId, stopId, tripPlaceId } from './test-support';

const plan = buildPlan();
const day1 = plan.days[0]!;
const locationOf = (id: string): LngLat | undefined =>
  plan.places.find((place) => place.id === id)?.place.location;

function input(overrides: Partial<DayRouteInput> = {}): DayRouteInput {
  return {
    stops: day1.stops,
    locationOf,
    dayMode: 'walk',
    mode: null,
    failed: false,
    ...overrides,
  };
}

function summary(legs: DayRouteSummary['legs']): DayRouteSummary {
  return { dayId: dayId(1), legs, distanceMeters: null, durationSeconds: null };
}

const cachedLeg = (from: number, to: number) => ({
  fromStopId: stopId(from),
  toStopId: stopId(to),
  mode: 'walk' as const,
  distanceMeters: 500,
  durationSeconds: 400,
  estimated: false,
});

describe('estimateLeg', () => {
  it('walks_the_straight_line_times_1_4_at_4_6_kmh', () => {
    const leg = estimateLeg('walk', { lng: 0, lat: 0 }, { lng: 0, lat: 0.01 });

    expect(leg.distanceMeters).toBe(1557);
    expect(leg.durationSeconds).toBe(Math.round(1557 / (4.6 / 3.6)));
  });

  it('drives_long_legs_at_highway_speed', () => {
    const leg = estimateLeg('drive', { lng: 0, lat: 0 }, { lng: 0, lat: 0.1 });

    expect(leg.durationSeconds).toBe(Math.round(leg.distanceMeters / (65 / 3.6)));
  });
});

describe('dayRouteView', () => {
  it('has_no_legs_for_a_day_with_one_stop', () => {
    const view = dayRouteView(input({ stops: day1.stops.slice(0, 1) }));

    expect(view).toEqual({ legs: [], totals: null, estimated: false, unroutableStopIds: [] });
  });

  it('reads_legs_and_totals_from_the_route_of_these_stops', () => {
    const view = dayRouteView(input({ route: buildDayRoute(plan, dayId(1)) }));

    expect(view.legs.map((leg) => leg?.durationSeconds)).toEqual([720, 720]);
    expect(view.totals).toEqual({ distanceMeters: 1800, durationSeconds: 1440 });
    expect(view.estimated).toBe(false);
  });

  it('ignores_a_route_computed_for_another_order', () => {
    const reversed = { ...day1, stops: [...day1.stops].reverse() };
    const route = buildDayRoute({ ...plan, days: [reversed] }, dayId(1));

    const view = dayRouteView(input({ route }));

    expect(view.legs).toEqual([null, null]);
    expect(view.totals).toBeNull();
  });

  it('uses_cached_summary_legs_for_the_saved_mode_only', () => {
    const cached = summary([cachedLeg(1, 2), null]);

    expect(dayRouteView(input({ summary: cached })).legs[0]?.durationSeconds).toBe(400);
    expect(dayRouteView(input({ summary: cached })).totals).toBeNull();
    expect(dayRouteView(input({ summary: cached, mode: 'bike' })).legs[0]).toBeNull();
  });

  it('ignores_a_summary_leg_that_no_longer_links_these_stops', () => {
    const view = dayRouteView(input({ summary: summary([cachedLeg(1, 3), null]) }));

    expect(view.legs[0]).toBeNull();
  });

  it('falls_back_to_straight_line_estimates_in_each_legs_mode_after_a_failure', () => {
    const stops = day1.stops.map((stop, i) =>
      i === 0 ? { ...stop, modeToNext: 'drive' as const } : stop,
    );

    const view = dayRouteView(input({ stops, failed: true }));

    expect(view.legs.map((leg) => [leg?.mode, leg?.estimated])).toEqual([
      ['drive', true],
      ['walk', true],
    ]);
    expect(view.estimated).toBe(true);
    expect(view.totals).not.toBeNull();
  });

  it('url_mode_overrides_every_leg_of_the_estimate', () => {
    const stops = day1.stops.map((stop) => ({ ...stop, modeToNext: 'drive' as const }));

    const view = dayRouteView(input({ stops, failed: true, mode: 'bike' }));

    expect(view.legs.map((leg) => leg?.mode)).toEqual(['bike', 'bike']);
  });

  it('names_the_stop_whose_every_leg_is_unroutable', () => {
    const route = buildDayRoute(plan, dayId(1), (i) => ({ estimated: true, unroutable: i === 1 }));
    const tail = buildDayRoute(plan, dayId(1), () => ({ estimated: true, unroutable: true }));

    expect(dayRouteView(input({ route })).unroutableStopIds).toEqual([stopId(3)]);
    expect(dayRouteView(input({ route: tail })).unroutableStopIds).toEqual([
      stopId(1),
      stopId(2),
      stopId(3),
    ]);
    expect(dayRouteView(input({ route })).estimated).toBe(true);
  });
});

describe('dayRouteLines', () => {
  const base = { id: 'd1', stops: day1.stops, locationOf, colorToken: '--day-1' as const };

  it('draws_nothing_while_loading', () => {
    expect(dayRouteLines({ ...base, failed: false })).toEqual([]);
  });

  it('draws_each_routed_leg_from_its_polyline', () => {
    const lines = dayRouteLines({ ...base, failed: false, route: buildDayRoute(plan, dayId(1)) });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ id: 'd1:0', estimated: false, colorToken: '--day-1' });
    expect(lines[0]?.points.length).toBeGreaterThan(1);
  });

  it('draws_dashed_straight_lines_after_a_failure', () => {
    const lines = dayRouteLines({ ...base, failed: true });
    const from = locationOf(tripPlaceId(1));
    const to = locationOf(tripPlaceId(2));

    expect(lines[0]).toEqual({
      id: 'd1:0',
      points: [
        [from?.lng, from?.lat],
        [to?.lng, to?.lat],
      ],
      colorToken: '--day-1',
      estimated: true,
    });
  });
});
