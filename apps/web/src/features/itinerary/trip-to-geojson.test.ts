import { describe, expect, it } from 'vitest';
import { applyAddTripPlace } from './apply-plan-ops';
import { buildPlan, buildTripPlace, dayId, tripPlaceId } from './test-support';
import { planPins } from './trip-to-geojson';

describe('planPins', () => {
  it('numbers_one_days_stops_in_its_colour', () => {
    const pins = planPins(buildPlan(), dayId(1));

    expect(pins.map((pin) => [pin.id, pin.order, pin.colorToken, pin.variant])).toEqual([
      [tripPlaceId(1), 1, '--day-1', 'stop'],
      [tripPlaceId(2), 2, '--day-1', 'stop'],
      [tripPlaceId(3), 3, '--day-1', 'stop'],
    ]);
  });

  it('shows_ideas_as_rings_without_numbers', () => {
    const pins = planPins(buildPlan(), 'ideas');

    expect(pins.map((pin) => [pin.id, pin.variant, pin.order])).toEqual([
      [tripPlaceId(5), 'idea', undefined],
    ]);
  });

  it('shows_every_day_and_the_ideas_once_each_for_all', () => {
    const plan = buildPlan();
    const hotelTwice = {
      ...plan,
      days: [
        plan.days[0]!,
        {
          ...plan.days[1]!,
          stops: [
            ...plan.days[1]!.stops,
            { id: 'again', tripPlaceId: tripPlaceId(1), modeToNext: null },
          ],
        },
      ],
    };

    const pins = planPins(hotelTwice, 'all');

    expect(pins.map((pin) => pin.id)).toEqual([1, 2, 3, 4, 5].map(tripPlaceId));
    expect(pins.find((pin) => pin.id === tripPlaceId(4))?.colorToken).toBe('--day-2');
  });

  it('marks_a_place_waiting_for_the_server_as_saving', () => {
    const plan = applyAddTripPlace(
      buildPlan(),
      { ...buildTripPlace(6), id: 'pending-3' },
      {
        dayId: dayId(2),
        stopId: 'pending-4',
      },
    );

    expect(planPins(plan, dayId(2)).at(-1)).toMatchObject({
      id: 'pending-3',
      variant: 'saving',
      order: 2,
    });
  });

  it('is_empty_for_an_unknown_day', () => {
    expect(planPins(buildPlan(), 'gone')).toEqual([]);
  });
});
