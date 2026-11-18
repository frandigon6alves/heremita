import type { Locale } from '@heremita/shared';

/**
 * Calendar dates (`YYYY-MM-DD`) and months (`YYYY-MM`) of the contract are not
 * instants: they are read as UTC midnight and formatted in UTC, so no time
 * zone moves them to the previous or next day.
 */
const TIME_ZONE = 'UTC';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function utcMidnight(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Not a calendar date: ${isoDate}`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/** "sáb., 14 de mar." (pt-BR) / "Sat, Mar 14" (en) by default. */
export function formatCalendarDate(
  isoDate: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: TIME_ZONE }).format(
    utcMidnight(isoDate),
  );
}

/** "out. de 2026" (pt-BR) / "Oct 2026" (en): a review's visit month. */
export function formatYearMonth(yearMonth: string, locale: Locale): string {
  return formatCalendarDate(`${yearMonth}-01`, locale, { month: 'short', year: 'numeric' });
}

/** The calendar date `days` after `isoDate` (a trip's day N date from its start date). */
export function addDays(isoDate: string, days: number): string {
  return new Date(utcMidnight(isoDate).getTime() + days * DAY).toISOString().slice(0, 10);
}

const RELATIVE_STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', YEAR],
  ['month', MONTH],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
];

/**
 * "há 3 dias" / "3 days ago" for a timestamp. `now` comes from the server
 * render and is passed down, so server HTML and hydration agree.
 */
export function formatRelativeTime(timestamp: string, now: Date, locale: Locale): string {
  const elapsed = new Date(timestamp).getTime() - now.getTime();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(elapsed) >= size) {
      return format.format(Math.round(elapsed / size), unit);
    }
  }
  return format.format(Math.round(elapsed / SECOND), 'second');
}
