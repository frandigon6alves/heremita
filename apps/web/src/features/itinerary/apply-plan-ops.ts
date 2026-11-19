import type {
  AddTripPlaceResponse,
  DayOwner,
  Stop,
  TravelMode,
  TripPlaceOwner,
  TripPlanOwner,
} from '@heremita/shared';

/**
 * Optimistic edits of the planner's cached plan: what each mutation's
 * `onMutate` shows before the server answers. Pure; the server's next plan
 * replaces the result on settle.
 */

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) {
    return length;
  }
  return Math.min(Math.max(index, 0), length);
}

function insertAt<T>(items: readonly T[], index: number | undefined, item: T): T[] {
  const at = clampIndex(index, items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

function withDays(plan: TripPlanOwner, days: DayOwner[]): TripPlanOwner {
  return { ...plan, days, trip: { ...plan.trip, dayCount: days.length } };
}

function withPlaces(plan: TripPlanOwner, places: TripPlaceOwner[]): TripPlanOwner {
  return { ...plan, places, trip: { ...plan.trip, placeCount: places.length } };
}

function mapDay(
  plan: TripPlanOwner,
  dayId: string,
  change: (stops: Stop[]) => Stop[],
): TripPlanOwner {
  return {
    ...plan,
    days: plan.days.map((day) => (day.id === dayId ? { ...day, stops: change(day.stops) } : day)),
  };
}

/** Moves a stop to `index` (clamped) of a day, the same or another one. */
export function applyMoveStop(
  plan: TripPlanOwner,
  stopId: string,
  toDayId: string,
  index: number,
): TripPlanOwner {
  const stop = plan.days.flatMap((day) => day.stops).find((candidate) => candidate.id === stopId);
  if (!stop) {
    return plan;
  }
  const without = applyRemoveStop(plan, stopId);
  return mapDay(without, toDayId, (stops) => insertAt(stops, index, stop));
}

/** A day's stops in the given order; ids not in the day are ignored, missing ones keep the end. */
export function applyReorder(
  plan: TripPlanOwner,
  dayId: string,
  stopIds: readonly string[],
): TripPlanOwner {
  return mapDay(plan, dayId, (stops) => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const ordered = stopIds.flatMap((id) => {
      const stop = byId.get(id);
      return stop ? [stop] : [];
    });
    return [...ordered, ...stops.filter((stop) => !stopIds.includes(stop.id))];
  });
}

/** Takes a stop off its day; its place stays in the trip (an idea if it has no other stop). */
export function applyRemoveStop(plan: TripPlanOwner, stopId: string): TripPlanOwner {
  return {
    ...plan,
    days: plan.days.map((day) =>
      day.stops.some((stop) => stop.id === stopId)
        ? { ...day, stops: day.stops.filter((stop) => stop.id !== stopId) }
        : day,
    ),
  };
}

/** Puts a trip place on a day at `index` (appended when absent). */
export function applyAddStop(
  plan: TripPlanOwner,
  dayId: string,
  stop: Stop,
  index?: number,
): TripPlanOwner {
  return mapDay(plan, dayId, (stops) => insertAt(stops, index, stop));
}

/** Removes a place from the trip with every stop it had. */
export function applyDeleteTripPlace(plan: TripPlanOwner, tripPlaceId: string): TripPlanOwner {
  const days = plan.days.map((day) => ({
    ...day,
    stops: day.stops.filter((stop) => stop.tripPlaceId !== tripPlaceId),
  }));
  return withPlaces(
    { ...plan, days },
    plan.places.filter((place) => place.id !== tripPlaceId),
  );
}

export interface PendingSchedule {
  dayId: string;
  index?: number;
  stopId: string;
}

/** Adds a place (and its stop when scheduled) before the server confirms it. */
export function applyAddTripPlace(
  plan: TripPlanOwner,
  tripPlace: TripPlaceOwner,
  schedule: PendingSchedule | null,
): TripPlanOwner {
  const added = withPlaces(plan, [...plan.places, tripPlace]);
  if (!schedule) {
    return added;
  }
  return applyAddStop(
    added,
    schedule.dayId,
    { id: schedule.stopId, tripPlaceId: tripPlace.id, modeToNext: null },
    schedule.index,
  );
}

/** Swaps the pending ids of an optimistic add for the server's. */
export function applyConfirmedAdd(
  plan: TripPlanOwner,
  pending: { tripPlaceId: string; stopId: string | null },
  response: AddTripPlaceResponse,
): TripPlanOwner {
  return {
    ...plan,
    places: plan.places.map((place) =>
      place.id === pending.tripPlaceId ? response.tripPlace : place,
    ),
    days: plan.days.map((day) => ({
      ...day,
      stops: day.stops.map((stop) =>
        stop.id === pending.stopId && response.stopId !== null
          ? { ...stop, id: response.stopId, tripPlaceId: response.tripPlace.id }
          : stop,
      ),
    })),
  };
}

export function applyNote(
  plan: TripPlanOwner,
  tripPlaceId: string,
  note: string | null,
): TripPlanOwner {
  return {
    ...plan,
    places: plan.places.map((place) => (place.id === tripPlaceId ? { ...place, note } : place)),
  };
}

/** Appends a day. */
export function applyCreateDay(plan: TripPlanOwner, day: DayOwner): TripPlanOwner {
  return withDays(plan, [...plan.days, day]);
}

/**
 * Deletes a day: its stops go (their places stay, as ideas when they have no
 * other stop) and later days move up one number, taking the earlier dates.
 */
export function applyDeleteDay(plan: TripPlanOwner, dayId: string): TripPlanOwner {
  const dates = plan.days.map((day) => day.date);
  const days = plan.days
    .filter((day) => day.id !== dayId)
    .map((day, index) => ({ ...day, number: index + 1, date: dates[index] ?? null }));
  return withDays(plan, days);
}

/** Sets the mode of the leg leaving a stop; `null` = the day's mode. */
export function applyLegMode(
  plan: TripPlanOwner,
  stopId: string,
  modeToNext: TravelMode | null,
): TripPlanOwner {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      stops: day.stops.map((stop) => (stop.id === stopId ? { ...stop, modeToNext } : stop)),
    })),
  };
}
