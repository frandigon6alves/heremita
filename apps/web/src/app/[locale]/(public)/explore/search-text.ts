import { LIMITS } from '@heremita/shared';

/** `?q=` of Explore as E48 accepts it: one value, trimmed, at most 80 characters. */
export function searchText(q: string | string[] | undefined): string {
  const text = typeof q === 'string' ? q.trim() : '';
  return text.slice(0, LIMITS.PUBLIC_TRIPS_Q_MAX).trim();
}
