import { describe, expect, it } from 'vitest';
import {
  applyAddStop,
  applyAddTripPlace,
  applyConfirmedAdd,
  applyCreateDay,
  applyDeleteDay,
  applyDeleteTripPlace,
  applyLegMode,
  applyMoveStop,
  applyNote,
  applyRemoveStop,
  applyReorder,
} from './apply-plan-ops';
import { ideaIds } from './plan-view';
import { buildPlan, buildTripPlace, dayId, dayNames, stopId, tripPlaceId } from './test-support';

describe('applyMoveStop', () => {
  it('moves_a_stop_down_within_its_day', () => {
    const plan = applyMoveStop(buildPlan(), stopId(1), dayId(1), 1);

    expect(dayNames(plan, 1)).toEqual([
      'Miradouro da Graça',
      'Castelo de São Jorge',
      'Time Out Market',
    ]);
  });

  it('moves_a_stop_to_the_end_of_another_day', () => {
    const plan = applyMoveStop(buildPlan(), stopId(2), dayId(2), 1);

    expect(dayNames(plan, 1)).toEqual(['Castelo de São Jorge', 'Time Out Market']);
    expect(dayNames(plan, 2)).toEqual(['Belém Tower', 'Miradouro da Graça']);
  });

  it('clamps_an_index_past_the_end', () => {
    const plan = applyMoveStop(buildPlan(), stopId(1), dayId(2), 99);

    expect(dayNames(plan, 2)).toEqual(['Belém Tower', 'Castelo de São Jorge']);
  });

  it('leaves_the_plan_alone_for_an_unknown_stop', () => {
    const before = buildPlan();

    expect(applyMoveStop(before, 'missing', dayId(1), 0)).toBe(before);
  });
});

describe('applyReorder', () => {
  it('puts_the_stops_in_the_given_order', () => {
    const plan = applyReorder(buildPlan(), dayId(1), [stopId(3), stopId(1), stopId(2)]);

    expect(dayNames(plan, 1)).toEqual([
      'Time Out Market',
      'Castelo de São Jorge',
      'Miradouro da Graça',
    ]);
  });

  it('keeps_stops_missing_from_the_order_at_the_end', () => {
    const plan = applyReorder(buildPlan(), dayId(1), [stopId(2)]);

    expect(dayNames(plan, 1)).toEqual([
      'Miradouro da Graça',
      'Castelo de São Jorge',
      'Time Out Market',
    ]);
  });
});

describe('applyRemoveStop', () => {
  it('takes_the_stop_off_and_its_place_becomes_an_idea', () => {
    const plan = applyRemoveStop(buildPlan(), stopId(4));

    expect(dayNames(plan, 2)).toEqual([]);
    expect(ideaIds(plan)).toEqual([tripPlaceId(4), tripPlaceId(5)]);
  });
});

describe('applyAddStop', () => {
  it('inserts_at_the_index', () => {
    const plan = applyAddStop(
      buildPlan(),
      dayId(1),
      { id: 'pending-1', tripPlaceId: tripPlaceId(5), modeToNext: null },
      0,
    );

    expect(dayNames(plan, 1)[0]).toBe('LX Factory');
  });

  it('appends_without_an_index', () => {
    const plan = applyAddStop(buildPlan(), dayId(2), {
      id: 'pending-1',
      tripPlaceId: tripPlaceId(5),
      modeToNext: null,
    });

    expect(dayNames(plan, 2)).toEqual(['Belém Tower', 'LX Factory']);
  });
});

describe('applyDeleteTripPlace', () => {
  it('removes_the_place_with_its_stops_and_counts_it', () => {
    const plan = applyDeleteTripPlace(buildPlan(), tripPlaceId(1));

    expect(plan.places.map((place) => place.id)).not.toContain(tripPlaceId(1));
    expect(dayNames(plan, 1)).toEqual(['Miradouro da Graça', 'Time Out Market']);
    expect(plan.trip.placeCount).toBe(4);
  });
});

describe('applyAddTripPlace + applyConfirmedAdd', () => {
  it('adds_a_pending_place_on_a_day_then_swaps_in_the_server_ids', () => {
    const pending = { ...buildTripPlace(6), id: 'pending-7' };
    const added = applyAddTripPlace(buildPlan(), pending, {
      dayId: dayId(2),
      stopId: 'pending-8',
    });

    expect(added.trip.placeCount).toBe(6);
    expect(added.days[1]?.stops.at(-1)).toEqual({
      id: 'pending-8',
      tripPlaceId: 'pending-7',
      modeToNext: null,
    });

    const server = buildTripPlace(6);
    const confirmed = applyConfirmedAdd(
      added,
      { tripPlaceId: 'pending-7', stopId: 'pending-8' },
      { tripPlace: server, stopId: stopId(6), planVersion: 8 },
    );

    expect(confirmed.places.at(-1)).toEqual(server);
    expect(confirmed.days[1]?.stops.at(-1)).toEqual({
      id: stopId(6),
      tripPlaceId: server.id,
      modeToNext: null,
    });
  });

  it('adds_an_idea_without_a_stop', () => {
    const plan = applyAddTripPlace(buildPlan(), { ...buildTripPlace(6), id: 'pending-1' }, null);

    expect(ideaIds(plan)).toEqual([tripPlaceId(5), 'pending-1']);
  });
});

describe('applyNote', () => {
  it('sets_the_note_of_one_place_only', () => {
    const plan = applyNote(buildPlan(), tripPlaceId(2), 'Sunset here');

    expect(plan.places.map((place) => place.note)).toEqual([null, 'Sunset here', null, null, null]);
  });
});

describe('applyCreateDay', () => {
  it('appends_the_day_and_counts_it', () => {
    const plan = applyCreateDay(buildPlan(), {
      id: 'pending-1',
      number: 3,
      date: null,
      mode: 'walk',
      modeOverride: null,
      stops: [],
    });

    expect(plan.days.map((day) => day.number)).toEqual([1, 2, 3]);
    expect(plan.trip.dayCount).toBe(3);
  });
});

describe('applyDeleteDay', () => {
  it('renumbers_later_days_keeping_dates_by_position_and_frees_its_places', () => {
    const dated = buildPlan({
      days: buildPlan().days.map((day, index) => ({ ...day, date: `2027-03-1${index + 4}` })),
    });

    const plan = applyDeleteDay(dated, dayId(1));

    expect(plan.days).toHaveLength(1);
    expect(plan.days[0]).toMatchObject({ id: dayId(2), number: 1, date: '2027-03-14' });
    expect(plan.trip.dayCount).toBe(1);
    expect(ideaIds(plan)).toEqual([tripPlaceId(1), tripPlaceId(2), tripPlaceId(3), tripPlaceId(5)]);
  });
});

describe('applyLegMode', () => {
  it('sets_only_that_stops_leg_mode_and_null_restores_the_days', () => {
    const plan = applyLegMode(buildPlan(), stopId(2), 'bike');

    expect(plan.days[0]?.stops.map((stop) => stop.modeToNext)).toEqual([null, 'bike', null]);
    expect(applyLegMode(plan, stopId(2), null).days[0]?.stops[1]?.modeToNext).toBeNull();
  });
});
