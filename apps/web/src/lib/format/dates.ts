import type { Locale } from '@heremita/shared';

/**
 * Calendar dates (`YYYY-MM-DD`) and months (`YYYY-MM`) of the contract are not
 * instants: they are read as UTC midnight and formatted in UTC, so no time
 * zone moves them to the previous or next day.
 */
const TIME_ZONE = 'UTC';

const DAY = 24 * 60 * 60 * 1000;

function utcMidnight(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Not a calendar date: ${isoDate}`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Sat, Mar 14" (en) / "sáb, 14 mar" (es) / "sáb., 14 de mar." (pt-BR) by default. */
export function formatCalendarDate(
  isoDate: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: TIME_ZONE }).format(
    utcMidnight(isoDate),
  );
}

/** "Oct 2026" (en) / "oct 2026" (es) / "out. de 2026" (pt-BR): a review's visit month. */
export function formatYearMonth(yearMonth: string, locale: Locale): string {
  return formatCalendarDate(`${yearMonth}-01`, locale, { month: 'short', year: 'numeric' });
}

/** The calendar date `days` after `isoDate` (a trip's day N date from its start date). */
export function addDays(isoDate: string, days: number): string {
  return new Date(utcMidnight(isoDate).getTime() + days * DAY).toISOString().slice(0, 10);
}
