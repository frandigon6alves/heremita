// The option lists of the contract as plain arrays, without zod: the web app
// reads them in code every page loads (locale routing, theme script, switches),
// where pulling zod in would cost every route. The enum schemas build on these.

/** UI languages: English is the official one, Spanish and Brazilian Portuguese are translations. */
export const LOCALES = ['en', 'es', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];

/** The language of a visitor nothing else tells us about. */
export const DEFAULT_LOCALE: Locale = 'en';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const TRAVEL_MODES = ['walk', 'bike', 'drive'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export const REVIEW_SORTS = ['recent', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const REPORT_REASONS = [
  'spam',
  'offensive',
  'misleading',
  'personal_data',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const PLACE_SEARCH_INTENTS = ['autocomplete', 'submit'] as const;
export type PlaceSearchIntent = (typeof PLACE_SEARCH_INTENTS)[number];

/** Narrows any value to one of `options` (a URL segment, a stored preference …). */
export function isOneOf<const T extends string>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value);
}
