import { describe, expect, it } from 'vitest';
import { signedOutRedirect } from './gate-redirect';

describe('signedOutRedirect', () => {
  it('sends_to_login_with_next_back_to_the_requested_page', () => {
    expect(signedOutRedirect('pt-BR', '/pt-BR/trips/abc?day=ideas')).toBe(
      '/pt-BR/login?next=%2Fpt-BR%2Ftrips%2Fabc%3Fday%3Dideas',
    );
  });

  it('uses_the_page_locale_for_the_login_page', () => {
    expect(signedOutRedirect('en', '/en/settings')).toBe('/en/login?next=%2Fen%2Fsettings');
  });

  it.each([null, '//evil.example/en/', '/en/\\\\evil', '/fr/trips'])(
    'drops_an_unsafe_or_missing_path %s',
    (requested) => {
      expect(signedOutRedirect('en', requested)).toBe('/en/login');
    },
  );
});
