import { describe, expect, it } from 'vitest';
import {
  localeAlternates,
  isPublicPath,
  isSafeNextPath,
  loginRedirectFor,
  routes,
  safeNext,
  switchLocalePath,
} from './routes';

describe('routes', () => {
  it('prefixes_every_path_with_the_locale', () => {
    expect(routes.landing('pt-BR')).toBe('/pt-BR');
    expect(routes.trips('en')).toBe('/en/trips');
    expect(routes.tripSettings('en', 'trip-1')).toBe('/en/trips/trip-1/settings');
  });

  it('adds_only_the_query_values_that_are_set', () => {
    expect(routes.planner('pt-BR', 't1', { day: 'ideas', place: undefined, mode: '' })).toBe(
      '/pt-BR/trips/t1?day=ideas',
    );
    expect(routes.explore('en')).toBe('/en/explore');
    expect(routes.login('en', { next: '/en/trips?x=1' })).toBe(
      '/en/login?next=%2Fen%2Ftrips%3Fx%3D1',
    );
  });

  it('encodes_ids_and_tokens_as_one_segment', () => {
    expect(routes.sharedTrip('en', 'a/b?c')).toBe('/en/s/a%2Fb%3Fc');
  });
});

describe('isSafeNextPath', () => {
  it.each(['/pt-BR/trips', '/es/trips', '/en/trips/abc?day=ideas', '/en/'])(
    'accepts %s',
    (next) => {
      expect(isSafeNextPath(next)).toBe(true);
    },
  );

  it.each([
    null,
    undefined,
    '',
    '/',
    '/en',
    '//evil.example/en/',
    '/\\evil.example',
    '/en/\\evil',
    'https://evil.example/en/',
    '/fr/trips',
    'en/trips',
    '/english/trips',
    '/espanol/trips',
  ])('rejects %s', (next) => {
    expect(isSafeNextPath(next)).toBe(false);
  });
});

describe('switchLocalePath', () => {
  it('swaps_the_prefix_and_keeps_path_and_query', () => {
    expect(switchLocalePath('/pt-BR/trips/t1?day=ideas&place=p', 'en')).toBe(
      '/en/trips/t1?day=ideas&place=p',
    );
  });

  it('swaps_between_every_pair_of_locales', () => {
    expect(switchLocalePath('/en/explore?q=lisboa', 'es')).toBe('/es/explore?q=lisboa');
    expect(switchLocalePath('/es/explore?q=lisboa', 'pt-BR')).toBe('/pt-BR/explore?q=lisboa');
    expect(switchLocalePath('/pt-BR/explore?q=lisboa', 'es')).toBe('/es/explore?q=lisboa');
  });

  it('handles_the_locale_root_with_and_without_query', () => {
    expect(switchLocalePath('/en', 'pt-BR')).toBe('/pt-BR');
    expect(switchLocalePath('/en?q=lisboa', 'pt-BR')).toBe('/pt-BR?q=lisboa');
  });

  it('prefixes_a_path_without_locale', () => {
    expect(switchLocalePath('/explore', 'en')).toBe('/en/explore');
  });

  it('does_not_mistake_a_longer_segment_for_a_locale', () => {
    expect(switchLocalePath('/english/x', 'pt-BR')).toBe('/pt-BR/english/x');
    expect(switchLocalePath('/espresso', 'en')).toBe('/en/espresso');
  });
});

describe('isPublicPath', () => {
  it.each([
    '/pt-BR',
    '/en/',
    '/en/explore',
    '/en/t/trip-1',
    '/pt-BR/s/token',
    '/en/places/p1',
    '/en/u/u1',
    '/en/about',
    '/en/privacy',
    '/pt-BR/login',
    '/pt-BR/signup',
    '/es',
    '/es/explore',
  ])('is_public %s', (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each([
    '/en/trips',
    '/en/trips/new',
    '/en/trips/t1/settings',
    '/en/places/p1/review',
    '/en/settings',
    '/en/moderation',
    '/en/t/trip-1/extra',
    '/fr/explore',
    '/explore',
  ])('is_private %s', (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});

describe('loginRedirectFor', () => {
  it('keeps_path_and_query_as_next', () => {
    expect(loginRedirectFor('/en/trips/t1', '?day=d1&place=p1')).toBe(
      '/en/login?next=%2Fen%2Ftrips%2Ft1%3Fday%3Dd1%26place%3Dp1',
    );
  });

  it('is_null_on_public_pages_and_outside_the_locale_tree', () => {
    expect(loginRedirectFor('/en/explore', '?q=x')).toBeNull();
    expect(loginRedirectFor('/robots.txt', '')).toBeNull();
  });

  it('drops_a_next_the_login_page_would_refuse', () => {
    expect(loginRedirectFor('/en/trips/a\\b', '')).toBe('/en/login');
  });
});

describe('safeNext', () => {
  it('keeps_a_single_safe_value', () => {
    expect(safeNext('/pt-BR/t/abc?copy=1')).toBe('/pt-BR/t/abc?copy=1');
  });

  it.each([undefined, '//evil.example/en/', 'https://evil.example/en/'])(
    'drops_an_unsafe_or_missing_value %s',
    (next) => {
      expect(safeNext(next)).toBeUndefined();
    },
  );

  it('drops_a_repeated_parameter', () => {
    expect(safeNext(['/en/trips', '/en/settings'])).toBeUndefined();
  });
});

describe('localeAlternates', () => {
  it('maps_every_locale_to_its_path', () => {
    expect(localeAlternates((locale) => routes.about(locale))).toEqual({
      en: '/en/about',
      es: '/es/about',
      'pt-BR': '/pt-BR/about',
    });
  });
});
