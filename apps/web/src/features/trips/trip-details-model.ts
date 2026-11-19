import type { DestinationInput, TravelMode, TripOwner, UpdateTripBody } from '@heremita/shared';
import { updateTripBodySchema } from '@/lib/schemas';

export interface TripDetailsValues {
  title: string;
  /** `''` = no description. */
  description: string;
  destination: DestinationInput | null;
  /** `YYYY-MM-DD`, `''` = no dates. */
  startDate: string;
  defaultMode: TravelMode;
}

export type TripDetailsField = keyof TripDetailsValues;

/** Why a field is invalid: zod issue codes, or `server` (the API refused it). */
export type TripDetailsIssues = Partial<Record<TripDetailsField, string>>;

export type TripDetailsParse =
  /** `body` holds only what changed; `null` when nothing did. */
  { ok: true; body: UpdateTripBody | null } | { ok: false; issues: TripDetailsIssues };

const FIELDS: readonly TripDetailsField[] = [
  'title',
  'description',
  'destination',
  'startDate',
  'defaultMode',
];

/** The settings form's starting values for a trip. */
export function detailsFromTrip(trip: TripOwner): TripDetailsValues {
  return {
    title: trip.title,
    description: trip.description ?? '',
    destination: trip.destination,
    startDate: trip.startDate ?? '',
    defaultMode: trip.defaultMode,
  };
}

/** The form field an API pointer (or a body issue path) names. */
export function tripDetailsFieldOf(path: readonly PropertyKey[]): TripDetailsField | null {
  return FIELDS.find((field) => field === path[0]) ?? null;
}

function sameDestination(a: DestinationInput | null, b: TripOwner['destination']): boolean {
  return (
    a?.name === b?.name &&
    a?.countryCode === b?.countryCode &&
    a?.center?.lng === b?.center?.lng &&
    a?.center?.lat === b?.center?.lat
  );
}

/**
 * Checks the form with the shared schema (text cleaned and bounded as the API
 * will) and returns the E21 body of the fields that differ from `trip`.
 */
export function parseTripDetails(values: TripDetailsValues, trip: TripOwner): TripDetailsParse {
  const result = updateTripBodySchema.safeParse({
    title: values.title,
    description: values.description === '' ? null : values.description,
    destination: values.destination,
    startDate: values.startDate === '' ? null : values.startDate,
    defaultMode: values.defaultMode,
  });
  if (!result.success) {
    const issues: TripDetailsIssues = {};
    for (const issue of result.error.issues) {
      const field = tripDetailsFieldOf(issue.path);
      if (field !== null && issues[field] === undefined) {
        issues[field] = issue.code;
      }
    }
    return { ok: false, issues };
  }

  const data = result.data;
  const description = data.description === '' ? null : (data.description ?? null);
  const body: UpdateTripBody = {
    ...(data.title === trip.title ? {} : { title: data.title }),
    ...(description === trip.description ? {} : { description }),
    ...(sameDestination(data.destination ?? null, trip.destination)
      ? {}
      : { destination: data.destination }),
    ...(data.startDate === trip.startDate ? {} : { startDate: data.startDate }),
    ...(data.defaultMode === trip.defaultMode ? {} : { defaultMode: data.defaultMode }),
  };
  return { ok: true, body: Object.keys(body).length === 0 ? null : body };
}
