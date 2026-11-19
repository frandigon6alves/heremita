import type { Locale } from '@heremita/shared';
import { addDays } from '@/lib/format/dates';

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
};

function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Days from `startDate` to `endDate`, both included; ≤ 0 when the end comes first. */
export function daysInRange(startDate: string, endDate: string): number {
  return Math.round((utcDate(endDate).getTime() - utcDate(startDate).getTime()) / DAY_MS) + 1;
}

/** "14–17 de mar. de 2027" / "Mar 14 – 17, 2027": first to last day of a dated trip. */
export function formatTripDates(startDate: string, dayCount: number, locale: Locale): string {
  const format = new Intl.DateTimeFormat(locale, RANGE_FORMAT);
  if (dayCount <= 1) {
    return format.format(utcDate(startDate));
  }
  return format.formatRange(utcDate(startDate), utcDate(addDays(startDate, dayCount - 1)));
}
