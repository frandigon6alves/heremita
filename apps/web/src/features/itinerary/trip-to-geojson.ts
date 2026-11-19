import type { MapPin } from '@/shared/map/pins-layer';
import {
  ALL_DAYS,
  dayColorToken,
  findDay,
  findPlace,
  ideaIds,
  IDEAS,
  isPendingId,
  type DaySelection,
  type PlanLike,
} from './plan-view';

const IDEA_COLOR = '--color-surface';

function pinOf(
  plan: PlanLike,
  tripPlaceId: string,
  stop: { dayNumber: number; order: number } | null,
): MapPin | null {
  const entry = findPlace(plan, tripPlaceId);
  if (!entry) {
    return null;
  }
  const { location, name } = entry.place;
  const lngLat = [location.lng, location.lat] as const;
  if (isPendingId(tripPlaceId)) {
    return {
      id: tripPlaceId,
      lngLat,
      label: name,
      colorToken: stop ? dayColorToken(stop.dayNumber) : IDEA_COLOR,
      variant: 'saving',
      ...(stop ? { order: stop.order } : {}),
    };
  }
  if (!stop) {
    return { id: tripPlaceId, lngLat, label: name, colorToken: IDEA_COLOR, variant: 'idea' };
  }
  return {
    id: tripPlaceId,
    lngLat,
    label: name,
    colorToken: dayColorToken(stop.dayNumber),
    variant: 'stop',
    order: stop.order,
  };
}

function dayPins(plan: PlanLike, day: PlanLike['days'][number]): MapPin[] {
  return day.stops.flatMap((stop, index) => {
    const pin = pinOf(plan, stop.tripPlaceId, { dayNumber: day.number, order: index + 1 });
    return pin ? [pin] : [];
  });
}

/** A place on several days (a hotel) gets one pin: its first stop's. Pin ids are trip place ids. */
function uniqueById(pins: MapPin[]): MapPin[] {
  const seen = new Set<string>();
  return pins.filter((pin) => {
    if (seen.has(pin.id)) {
      return false;
    }
    seen.add(pin.id);
    return true;
  });
}

function ideaPins(plan: PlanLike): MapPin[] {
  return ideaIds(plan).flatMap((id) => {
    const pin = pinOf(plan, id, null);
    return pin ? [pin] : [];
  });
}

/**
 * Pins of the selected part of the plan for `PinsLayer`: one day's numbered
 * stops in its colour, the ideas as rings, or every day plus the ideas.
 */
export function planPins(plan: PlanLike, selection: DaySelection): MapPin[] {
  if (selection === IDEAS) {
    return ideaPins(plan);
  }
  if (selection === ALL_DAYS) {
    return uniqueById([...plan.days.flatMap((day) => dayPins(plan, day)), ...ideaPins(plan)]);
  }
  const day = findDay(plan, selection);
  return day ? uniqueById(dayPins(plan, day)) : [];
}
