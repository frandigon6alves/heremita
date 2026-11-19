import type { Locale } from '@heremita/shared';
import { cachedFormatter } from './intl-cache';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

interface HoursMinutes {
  hours: number;
  minutes: number;
}

function unit(locale: Locale, name: 'hour' | 'minute', value: number): string {
  return cachedFormatter(Intl.NumberFormat, locale, {
    style: 'unit',
    unit: name,
    unitDisplay: 'short',
  }).format(value);
}

/** Browsers without `Intl.DurationFormat` (it shipped in 2025): one unit each, as "1 h 5 min". */
function formatWithoutDurationFormat(locale: Locale, { hours, minutes }: HoursMinutes): string {
  const parts = [];
  if (hours > 0) {
    parts.push(unit(locale, 'hour', hours));
  }
  if (minutes > 0) {
    parts.push(unit(locale, 'minute', minutes));
  }
  return parts.join(' ');
}

/**
 * Travel time for display, to the minute: "12 min", "1 hr, 5 min" (en),
 * "1 h y 5 min" (es), "1 h e 5 min" (pt-BR); zero units are left out ("2 h"). Under a minute →
 * "< 1 min".
 */
export function formatDuration(seconds: number, locale: Locale): string {
  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE);
  if (totalMinutes < 1) {
    return `< ${unit(locale, 'minute', 1)}`;
  }
  const duration: HoursMinutes = {
    hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
    minutes: totalMinutes % MINUTES_PER_HOUR,
  };
  if (typeof Intl.DurationFormat !== 'function') {
    return formatWithoutDurationFormat(locale, duration);
  }
  return cachedFormatter(Intl.DurationFormat, locale, { style: 'short' }).format(duration);
}
