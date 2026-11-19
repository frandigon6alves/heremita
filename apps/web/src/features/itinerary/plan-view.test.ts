import { describe, expect, it } from 'vitest';
import {
  dayColorToken,
  defaultDaySelection,
  ideaIds,
  locateStop,
  resolveDaySelection,
  selectionPoints,
  stopsOfPlace,
} from './plan-view';
import { buildPlan, dayId, stopId, tripPlaceId } from './test-support';

describe('day selection', () => {
  it('defaults_to_the_first_day_with_stops', () => {
    const plan = buildPlan();
    const firstEmpty = { ...plan, days: [{ ...plan.days[0]!, stops: [] }, plan.days[1]!] };

    expect(defaultDaySelection(firstEmpty)).toBe(dayId(2));
  });

  it('defaults_to_ideas_when_no_day_has_stops', () => {
    const plan = buildPlan();

    expect(defaultDaySelection({ ...plan, days: [] })).toBe('ideas');
  });

  it('keeps_a_param_naming_ideas_all_or_a_day', () => {
    const plan = buildPlan();

    expect(resolveDaySelection(plan, 'ideas')).toBe('ideas');
    expect(resolveDaySelection(plan, 'all')).toBe('all');
    expect(resolveDaySelection(plan, dayId(2))).toBe(dayId(2));
  });

  it('falls_back_to_the_default_for_a_missing_or_deleted_day', () => {
    const plan = buildPlan();

    expect(resolveDaySelection(plan, null)).toBe(dayId(1));
    expect(resolveDaySelection(plan, 'not-a-day')).toBe(dayId(1));
  });
});

describe('plan lookups', () => {
  it('lists_places_on_no_day_as_ideas', () => {
    expect(ideaIds(buildPlan())).toEqual([tripPlaceId(5)]);
  });

  it('locates_a_stop_by_day_and_index', () => {
    expect(locateStop(buildPlan(), stopId(3))).toEqual({ dayId: dayId(1), index: 2, total: 3 });
    expect(locateStop(buildPlan(), 'missing')).toBeNull();
  });

  it('finds_every_stop_of_a_place_on_several_days', () => {
    const plan = buildPlan();
    const twice = {
      ...plan,
      days: [
        plan.days[0]!,
        {
          ...plan.days[1]!,
          stops: [
            ...plan.days[1]!.stops,
            { id: 'hotel', tripPlaceId: tripPlaceId(1), modeToNext: null },
          ],
        },
      ],
    };

    expect(stopsOfPlace(twice, tripPlaceId(1))).toEqual([
      { stopId: stopId(1), dayId: dayId(1), index: 0 },
      { stopId: 'hotel', dayId: dayId(2), index: 1 },
    ]);
  });

  it('frames_the_points_of_the_selection', () => {
    const plan = buildPlan();

    expect(selectionPoints(plan, dayId(2))).toEqual([plan.places[3]?.place.location]);
    expect(selectionPoints(buildPlan(), 'all')).toHaveLength(5);
  });

  it('cycles_day_colours_after_eight_days', () => {
    expect(dayColorToken(1)).toBe('--day-1');
    expect(dayColorToken(8)).toBe('--day-8');
    expect(dayColorToken(9)).toBe('--day-1');
  });
});
