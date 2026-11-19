import {
  createTripBodySchema,
  LIMITS,
  type CreateTripBody,
  type DestinationInput,
} from '@heremita/shared';
import { daysInRange } from './trip-dates';

/** A trip is planned either with calendar dates or with a plain number of days. */
export type DatesChoice = 'none' | 'range';

export interface NewTripValues {
  title: string;
  destination: DestinationInput | null;
  dates: DatesChoice;
  /** `YYYY-MM-DD` from `<input type="date">`, `''` when empty. */
  startDate: string;
  endDate: string;
  /** `NaN` while the number field is empty. */
  dayCount: number;
}

export type NewTripField = 'title' | 'destination' | 'startDate' | 'endDate' | 'dayCount';

/**
 * Why a field is invalid: zod issue codes (`too_small`, `too_big`, …) plus
 * the form's own `required`, `before_start` and `server` (the API refused it).
 */
export type NewTripIssues = Partial<Record<NewTripField, string>>;

export type NewTripParse =
  { ok: true; body: CreateTripBody } | { ok: false; issues: NewTripIssues };

/** Day count of the trip as the form describes it; `null` while it cannot be known. */
export function chosenDayCount(
  values: Pick<NewTripValues, 'dates' | 'startDate' | 'endDate' | 'dayCount'>,
): number | null {
  if (values.dates === 'none') {
    return Number.isInteger(values.dayCount) ? values.dayCount : null;
  }
  if (values.startDate === '' || values.endDate === '') {
    return null;
  }
  return daysInRange(values.startDate, values.endDate);
}

function dateIssues(values: NewTripValues): NewTripIssues {
  if (values.dates === 'none') {
    const count = values.dayCount;
    const valid = Number.isInteger(count) && count >= 1 && count <= LIMITS.DAYS_PER_TRIP;
    return valid ? {} : { dayCount: 'invalid' };
  }
  const issues: NewTripIssues = {};
  if (values.startDate === '') {
    issues.startDate = 'required';
  }
  if (values.endDate === '') {
    issues.endDate = 'required';
  }
  const days = chosenDayCount(values);
  if (days !== null && days < 1) {
    issues.endDate = 'before_start';
  } else if (days !== null && days > LIMITS.DAYS_PER_TRIP) {
    issues.endDate = 'too_big';
  }
  return issues;
}

/** The form field an API pointer (or a body issue path) names. */
export function newTripFieldOf(
  path: readonly PropertyKey[],
  dates: DatesChoice,
): NewTripField | null {
  switch (path[0]) {
    case 'title':
      return 'title';
    case 'destination':
      return 'destination';
    case 'startDate':
      return 'startDate';
    case 'dayCount':
      return dates === 'range' ? 'endDate' : 'dayCount';
    default:
      return null;
  }
}

/**
 * Checks the form and builds the E19 body with the shared schema (so text is
 * cleaned and bounded exactly as the API will). Dated trips send the start
 * date and the day count of the range.
 */
export function parseNewTrip(values: NewTripValues): NewTripParse {
  const issues = dateIssues(values);
  const ranged = values.dates === 'range';
  const result = createTripBodySchema.safeParse({
    title: values.title,
    destination: values.destination,
    startDate: ranged && values.startDate !== '' ? values.startDate : null,
    dayCount: chosenDayCount(values) ?? 1,
  });

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = newTripFieldOf(issue.path, values.dates);
      if (field !== null && issues[field] === undefined) {
        issues[field] = issue.code;
      }
    }
  }
  if (Object.keys(issues).length > 0 || !result.success) {
    return { ok: false, issues };
  }
  return { ok: true, body: result.data };
}
