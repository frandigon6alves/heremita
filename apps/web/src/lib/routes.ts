import type { Locale } from '@heremita/shared';
import { routing } from '@/i18n/routing';

/**
 * Request header the proxy sets to the page's path and query: a layout cannot
 * read the URL, and the viewer gate needs it for `login?next=`. Only ever
 * used as a `next` candidate, so it is validated like any other.
 */
export const REQUEST_PATH_HEADER = 'x-heremita-path';

type Query = Readonly<Record<string, string | undefined>>;

function withQuery(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
}

const segment = encodeURIComponent;

export interface PlanQuery extends Query {
  day?: string;
  place?: string;
  mode?: string;
}

/** Every page URL of the app, always prefixed with its locale (§I.web.routes). */
export const routes = {
  landing: (locale: Locale) => `/${locale}`,
  explore: (locale: Locale, query: { q?: string } = {}) => withQuery(`/${locale}/explore`, query),
  publicTrip: (locale: Locale, tripId: string, query?: PlanQuery) =>
    withQuery(`/${locale}/t/${segment(tripId)}`, query),
  sharedTrip: (locale: Locale, shareToken: string, query?: PlanQuery) =>
    withQuery(`/${locale}/s/${segment(shareToken)}`, query),
  place: (locale: Locale, placeId: string, query: { sort?: string } = {}) =>
    withQuery(`/${locale}/places/${segment(placeId)}`, query),
  placeReview: (locale: Locale, placeId: string) => `/${locale}/places/${segment(placeId)}/review`,
  profile: (locale: Locale, userId: string) => `/${locale}/u/${segment(userId)}`,
  about: (locale: Locale) => `/${locale}/about`,
  privacy: (locale: Locale) => `/${locale}/privacy`,
  login: (locale: Locale, query: { next?: string } = {}) => withQuery(`/${locale}/login`, query),
  signup: (locale: Locale, query: { next?: string } = {}) => withQuery(`/${locale}/signup`, query),
  trips: (locale: Locale) => `/${locale}/trips`,
  newTrip: (locale: Locale) => `/${locale}/trips/new`,
  planner: (locale: Locale, tripId: string, query?: PlanQuery) =>
    withQuery(`/${locale}/trips/${segment(tripId)}`, query),
  tripSettings: (locale: Locale, tripId: string) => `/${locale}/trips/${segment(tripId)}/settings`,
  settings: (locale: Locale) => `/${locale}/settings`,
  moderation: (locale: Locale) => `/${locale}/moderation`,
} as const;

/**
 * `alternates.languages` of a page's metadata: the same page in every locale,
 * plus `x-default` (the default locale) for visitors matching none of them.
 * Paths are relative; the root layout's `metadataBase` makes them absolute.
 */
export function localeAlternates(
  pathOf: (locale: Locale) => string,
): Record<Locale | 'x-default', string> {
  return {
    ...(Object.fromEntries(routing.locales.map((locale) => [locale, pathOf(locale)])) as Record<
      Locale,
      string
    >),
    'x-default': pathOf(routing.defaultLocale),
  };
}

/**
 * Open-redirect guard for `?next=`: only a path of this app, under one of its
 * locale prefixes, is accepted. A backslash is refused too, because browsers
 * read `/\evil.example` as `//evil.example`.
 */
export function isSafeNextPath(next: string | null | undefined): next is string {
  if (next == null || next.startsWith('//') || next.includes('\\')) {
    return false;
  }
  return routing.locales.some((locale) => next.startsWith(`/${locale}/`));
}

/** `?next=` of the login and sign-up pages: kept only when safe (one value, an app path). */
export function safeNext(next: string | string[] | undefined): string | undefined {
  return typeof next === 'string' && isSafeNextPath(next) ? next : undefined;
}

/**
 * The same page in another language: swaps the locale prefix and keeps the
 * rest of the path and the query string.
 */
export function switchLocalePath(pathWithQuery: string, target: Locale): string {
  const current = routing.locales.find(
    (locale) =>
      pathWithQuery === `/${locale}` ||
      pathWithQuery.startsWith(`/${locale}/`) ||
      pathWithQuery.startsWith(`/${locale}?`),
  );
  const rest = current === undefined ? pathWithQuery : pathWithQuery.slice(current.length + 1);
  const normalised =
    rest === '' || rest.startsWith('/') || rest.startsWith('?') ? rest : `/${rest}`;
  return `/${target}${normalised}`;
}

/**
 * Pages anyone may open signed out (§I.web.routes `access` = all or token
 * holders). A 401 there is not a lost session to recover from: the page shows
 * what it can, and asks to log in only when the viewer acts.
 */
const PUBLIC_PAGE_PATTERNS: readonly RegExp[] = [
  /^$/,
  /^\/explore$/,
  /^\/t\/[^/]+$/,
  /^\/s\/[^/]+$/,
  /^\/places\/[^/]+$/,
  /^\/u\/[^/]+$/,
  /^\/(about|privacy|login|signup)$/,
];

function splitLocale(pathname: string): { locale: Locale; rest: string } | null {
  const locale = routing.locales.find(
    (candidate) => pathname === `/${candidate}` || pathname.startsWith(`/${candidate}/`),
  );
  return locale === undefined ? null : { locale, rest: pathname.slice(locale.length + 1) };
}

export function isPublicPath(pathname: string): boolean {
  const split = splitLocale(pathname);
  if (split === null) {
    return false;
  }
  const rest = split.rest.endsWith('/') ? split.rest.slice(0, -1) : split.rest;
  return PUBLIC_PAGE_PATTERNS.some((pattern) => pattern.test(rest));
}

/**
 * Where a lost session sends the viewer: login in the page's language, coming
 * back to this page afterwards. `null` on public pages (and outside the
 * locale tree), which stay where they are.
 */
export function loginRedirectFor(pathname: string, search: string): string | null {
  const split = splitLocale(pathname);
  if (split === null || isPublicPath(pathname)) {
    return null;
  }
  const current = `${pathname}${search}`;
  return routes.login(split.locale, isSafeNextPath(current) ? { next: current } : {});
}
