import type { Locale } from '@heremita/shared';
import { addDays } from '@/lib/format/dates';
import { cachedFormatter } from '@/lib/format/intl-cache';

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

/**
 * ICU pads a range's dash with a thin or narrow no-break space in some
 * versions (Node) and a plain space in others (Chromium): the same text
 * must come out of the server and the browser, or hydration fails.
 */
const ICU_SPACES = /[\u00a0\u2009\u202f]/g;

/** "14–17 de mar. de 2027" / "Mar 14 – 17, 2027": first to last day of a dated trip. */
export function formatTripDates(startDate: string, dayCount: number, locale: Locale): string {
  const format = cachedFormatter(Intl.DateTimeFormat, locale, RANGE_FORMAT);
  if (dayCount <= 1) {
    return format.format(utcDate(startDate));
  }
  return format
    .formatRange(utcDate(startDate), utcDate(addDays(startDate, dayCount - 1)))
    .replace(ICU_SPACES, ' ');
}
