import { describe, expect, it } from 'vitest';
import { ENV_DEFAULTS, InvalidEnvError, parsePublicEnv, parseServerEnv } from './env.schema';

describe('parseServerEnv', () => {
  it('applies_defaults_when_only_the_cookie_name_is_set', () => {
    const env = parseServerEnv({ SESSION_COOKIE_NAME: 'hm_session' });

    expect(env).toEqual({
      ...ENV_DEFAULTS,
      SESSION_COOKIE_NAME: 'hm_session',
      CONTACT_EMAIL: null,
      SERVER_FETCH_SECRET: null,
      NEXT_PUBLIC_E2E: false,
    });
  });

  it('treats_blank_values_as_unset', () => {
    const env = parseServerEnv({
      SESSION_COOKIE_NAME: '__Host-hm_session',
      API_URL: '  ',
      CONTACT_EMAIL: '',
    });

    expect(env.API_URL).toBe(ENV_DEFAULTS.API_URL);
    expect(env.CONTACT_EMAIL).toBeNull();
  });

  it('lists_every_invalid_variable_in_one_error', () => {
    const parse = () =>
      parseServerEnv({
        API_URL: 'localhost:3101/no scheme',
        SESSION_COOKIE_NAME: 'session',
        CONTACT_EMAIL: 'not-an-address',
        NEXT_PUBLIC_E2E: 'true',
      });

    expect(parse).toThrow(InvalidEnvError);
    try {
      parse();
    } catch (error) {
      const names = (error as InvalidEnvError).problems.map((problem) => problem.split(':')[0]);
      expect(names).toEqual(['NEXT_PUBLIC_E2E', 'API_URL', 'SESSION_COOKIE_NAME', 'CONTACT_EMAIL']);
    }
  });

  it('requires_a_long_server_fetch_secret_in_production_only', () => {
    const base = { SESSION_COOKIE_NAME: '__Host-hm_session' };
    const secret = 'a-production-secret-of-at-least-32-chars';

    expect(() => parseServerEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /SERVER_FETCH_SECRET: required in production/,
    );
    expect(() =>
      parseServerEnv({ ...base, NODE_ENV: 'production', SERVER_FETCH_SECRET: 'short' }),
    ).toThrow(/SERVER_FETCH_SECRET: must be at least 32 characters/);
    expect(parseServerEnv({ ...base, NODE_ENV: 'development' }).SERVER_FETCH_SECRET).toBeNull();
    expect(
      parseServerEnv({ ...base, NODE_ENV: 'production', SERVER_FETCH_SECRET: secret })
        .SERVER_FETCH_SECRET,
    ).toBe(secret);
  });

  it('rejects_a_missing_cookie_name', () => {
    expect(() => parseServerEnv({})).toThrow(/SESSION_COOKIE_NAME/);
  });
});

describe('parsePublicEnv', () => {
  it('turns_the_e2e_flag_on_only_for_1', () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_E2E: '1' }).NEXT_PUBLIC_E2E).toBe(true);
    expect(parsePublicEnv({}).NEXT_PUBLIC_E2E).toBe(false);
  });

  it('accepts_a_same_origin_style_path', () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_MAP_STYLE_LIGHT: '/dev/blank-style.json' });

    expect(env.NEXT_PUBLIC_MAP_STYLE_LIGHT).toBe('/dev/blank-style.json');
  });

  it('rejects_a_protocol_relative_or_bare_style_value', () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_MAP_STYLE_DARK: '//evil.example/style.json' }),
    ).toThrow(/NEXT_PUBLIC_MAP_STYLE_DARK/);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_MAP_STYLE_DARK: 'style.json' })).toThrow(
      /NEXT_PUBLIC_MAP_STYLE_DARK/,
    );
  });
});
