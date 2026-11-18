import type { Locale } from '@heremita/shared';

const METRES_PER_KM = 1000;
/** Below 1 km distances are shown to the nearest 10 m: routing is not more precise. */
const METRE_STEP = 10;

/**
 * Route distance for display, metric only: "450 m", "1 km", "3,2 km" (pt-BR).
 * A distance that rounds to 1000 m is shown as "1 km", never "1.000 m".
 */
export function formatDistance(meters: number, locale: Locale): string {
  const roundedMeters = Math.round(meters / METRE_STEP) * METRE_STEP;
  if (roundedMeters < METRES_PER_KM) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
    }).format(roundedMeters);
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(meters / METRES_PER_KM);
}
