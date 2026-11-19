import type { LngLat, PlaceSummary, Stop } from '@heremita/shared';

/** What the planner reads from a plan; both the owner and the viewer shapes satisfy it. */
export interface PlanLike {
  places: readonly { id: string; place: PlaceSummary }[];
  days: readonly { id: string; number: number; stops: readonly Stop[] }[];
}

export const IDEAS = 'ideas';
export const ALL_DAYS = 'all';

/** `?day=`: the ideas list, every day at once, or one day by id. */
export type DaySelection = typeof IDEAS | typeof ALL_DAYS | (string & {});

const DAY_COLOURS = 8;

/** Day colour token: day 9 takes day 1's colour again, its number keeps it apart. */
export function dayColorToken(dayNumber: number): `--day-${number}` {
  return `--day-${((dayNumber - 1) % DAY_COLOURS) + 1}`;
}

/** First day with stops; a plan with none opens on its ideas. */
export function defaultDaySelection(plan: PlanLike): DaySelection {
  return plan.days.find((day) => day.stops.length > 0)?.id ?? IDEAS;
}

/** The `day` param when it still names something in the plan, else the default. */
export function resolveDaySelection(plan: PlanLike, param: string | null): DaySelection {
  if (
    param !== null &&
    (param === IDEAS || param === ALL_DAYS || plan.days.some((day) => day.id === param))
  ) {
    return param;
  }
  return defaultDaySelection(plan);
}

/** Trip places on no day, in the order they were added. */
export function ideaIds(plan: PlanLike): string[] {
  const scheduled = new Set(plan.days.flatMap((day) => day.stops.map((stop) => stop.tripPlaceId)));
  return plan.places.filter((place) => !scheduled.has(place.id)).map((place) => place.id);
}

export function findDay<P extends PlanLike>(plan: P, dayId: string): P['days'][number] | undefined {
  return plan.days.find((day) => day.id === dayId);
}

export function findPlace<P extends PlanLike>(
  plan: P,
  tripPlaceId: string,
): P['places'][number] | undefined {
  return plan.places.find((place) => place.id === tripPlaceId);
}

/** Where a stop is: its day and its 0-based index there. */
export function locateStop(
  plan: PlanLike,
  stopId: string,
): { dayId: string; index: number; total: number } | null {
  for (const day of plan.days) {
    const index = day.stops.findIndex((stop) => stop.id === stopId);
    if (index !== -1) {
      return { dayId: day.id, index, total: day.stops.length };
    }
  }
  return null;
}

/** Every stop of a trip place, in day order. */
export function stopsOfPlace(
  plan: PlanLike,
  tripPlaceId: string,
): { stopId: string; dayId: string; index: number }[] {
  return plan.days.flatMap((day) =>
    day.stops.flatMap((stop, index) =>
      stop.tripPlaceId === tripPlaceId ? [{ stopId: stop.id, dayId: day.id, index }] : [],
    ),
  );
}

/** Trip places a selection shows: that day's stops in order, the ideas, or every place. */
export function placeIdsOf(plan: PlanLike, selection: DaySelection): string[] {
  if (selection === IDEAS) {
    return ideaIds(plan);
  }
  if (selection === ALL_DAYS) {
    return plan.places.map((place) => place.id);
  }
  return findDay(plan, selection)?.stops.map((stop) => stop.tripPlaceId) ?? [];
}

/** Points the camera frames for a selection: that day's stops, the ideas, or everything. */
export function selectionPoints(plan: PlanLike, selection: DaySelection): LngLat[] {
  return placeIdsOf(plan, selection).flatMap((id) => {
    const place = findPlace(plan, id);
    return place ? [place.place.location] : [];
  });
}

const PENDING_PREFIX = 'pending-';
let pendingCounter = 0;

/** Id of a row shown before the server answered (optimistic add); never sent to the API. */
export function newPendingId(): string {
  pendingCounter += 1;
  return `${PENDING_PREFIX}${pendingCounter}`;
}

export function isPendingId(id: string): boolean {
  return id.startsWith(PENDING_PREFIX);
}
