import { describe, expect, it } from 'vitest';
import {
  clearedSessionCookie,
  readSessionToken,
  sessionCookie,
  sessionCookieName,
} from './session-cookie.js';

const NOW = new Date('2026-11-18T10:00:00.000Z');
const NINETY_DAYS_S = 90 * 24 * 60 * 60;

describe('session cookie', () => {
  it('uses_the_host_prefixed_name_only_when_secure', () => {
    expect(sessionCookieName(true)).toBe('__Host-hm_session');
    expect(sessionCookieName(false)).toBe('hm_session');
  });

  it('lives_until_the_absolute_expiry_with_strict_attributes', () => {
    const expiry = new Date(NOW.getTime() + NINETY_DAYS_S * 1000);

    const cookie = sessionCookie('tok', expiry, NOW, false);

    expect(cookie).toBe(`hm_session=tok; Max-Age=${NINETY_DAYS_S}; Path=/; HttpOnly; SameSite=Lax`);
  });

  it('adds_secure_when_cookies_are_secure', () => {
    const expiry = new Date(NOW.getTime() + 61_500);

    const cookie = sessionCookie('tok', expiry, NOW, true);

    expect(cookie).toBe(
      '__Host-hm_session=tok; Max-Age=61; Path=/; HttpOnly; SameSite=Lax; Secure',
    );
  });

  it('never_sends_a_negative_max_age', () => {
    const cookie = sessionCookie('tok', new Date(NOW.getTime() - 5_000), NOW, false);

    expect(cookie).toContain('Max-Age=0;');
  });

  it('clears_with_an_empty_value_and_zero_max_age', () => {
    expect(clearedSessionCookie(true)).toBe(
      '__Host-hm_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
    );
  });

  it('reads_its_own_cookie_among_others', () => {
    const token = readSessionToken({ cookie: 'theme=dark; hm_session=abc-_123; x=1' }, false);

    expect(token).toBe('abc-_123');
  });

  it('ignores_the_cookie_of_the_other_mode_and_similar_names', () => {
    const headers = { cookie: 'hm_session=plain; my_hm_session=other' };

    expect(readSessionToken(headers, true)).toBeNull();
    expect(readSessionToken({ cookie: 'my_hm_session=other' }, false)).toBeNull();
  });

  it('treats_missing_or_empty_cookies_as_no_token', () => {
    expect(readSessionToken({}, false)).toBeNull();
    expect(readSessionToken({ cookie: 'hm_session=' }, false)).toBeNull();
  });
});
