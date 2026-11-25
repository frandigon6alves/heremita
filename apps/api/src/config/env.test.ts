import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.js';

const DATABASE_URL = 'postgresql://heremita:heremita@localhost:5434/heremita';
const MINIMAL = { DATABASE_URL, GEOCODING_PROVIDER: 'fake', ROUTING_PROVIDER: 'fake' };
const PRODUCTION = {
  ...MINIMAL,
  NODE_ENV: 'production',
  PUBLIC_SITE_URL: 'https://heremita.example',
  ALLOW_FAKE_PROVIDERS: 'true',
  SERVER_FETCH_SECRET: 'a-production-secret-of-at-least-32-chars',
};

describe('parseEnv', () => {
  it('applies_the_defaults', () => {
    const env = parseEnv(MINIMAL);

    expect(env).toEqual({
      ...MINIMAL,
      NODE_ENV: 'development',
      PORT: 3101,
      WEB_ORIGIN: 'http://localhost:3100',
      PUBLIC_SITE_URL: 'http://localhost:3100',
      COOKIE_SECURE: false,
      TRUST_PROXY: 'loopback, uniquelocal',
      LOG_LEVEL: 'info',
      ALLOW_FAKE_PROVIDERS: false,
      NOMINATIM_ENABLED: false,
      DEMO_PASSWORD: 'heremita-demo-2026',
      SERVER_FETCH_SECRET: null,
      AI_PROVIDER: 'off',
      ANTHROPIC_API_KEY: null,
      AI_MODEL: 'claude-opus-5-5',
      AI_DAILY_LIMIT: 200,
    });
  });

  it('requires_an_anthropic_key_for_the_claude_ai_provider', () => {
    expect(() => parseEnv({ ...MINIMAL, AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: ' ' })).toThrow(
      /- ANTHROPIC_API_KEY: is required when AI_PROVIDER=claude/,
    );
    expect(parseEnv({ ...MINIMAL, AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'sk-test' })).toEqual(
      expect.objectContaining({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'sk-test' }),
    );
  });

  it('refuses_the_fake_ai_provider_in_production_unless_fakes_are_allowed', () => {
    const parse = () =>
      parseEnv({ ...PRODUCTION, ALLOW_FAKE_PROVIDERS: undefined, AI_PROVIDER: 'fake' });

    expect(parse).toThrow(/- AI_PROVIDER: fake is refused in production/);
    expect(parseEnv({ ...PRODUCTION, AI_PROVIDER: 'fake' }).AI_PROVIDER).toBe('fake');
  });

  it('reads_the_port_as_a_number', () => {
    const env = parseEnv({ ...MINIMAL, PORT: '4000' });

    expect(env.PORT).toBe(4000);
  });

  it('defaults_secure_cookies_to_production_only', () => {
    const production = parseEnv(PRODUCTION);
    const overridden = parseEnv({ ...PRODUCTION, COOKIE_SECURE: 'false' });

    expect(production.COOKIE_SECURE).toBe(true);
    expect(overridden.COOKIE_SECURE).toBe(false);
  });

  it('keeps_only_the_origin_of_the_web_origin', () => {
    const env = parseEnv({ ...MINIMAL, WEB_ORIGIN: 'http://localhost:3110/' });

    expect(env.WEB_ORIGIN).toBe('http://localhost:3110');
  });

  it('parses_boolean_flags', () => {
    const env = parseEnv({
      ...MINIMAL,
      NOMINATIM_ENABLED: 'true',
      NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
      ALLOW_FAKE_PROVIDERS: '1',
    });

    expect(env.NOMINATIM_ENABLED).toBe(true);
    expect(env.ALLOW_FAKE_PROVIDERS).toBe(true);
  });

  it('requires_the_provider_urls_of_the_chosen_providers', () => {
    const parse = () =>
      parseEnv({
        DATABASE_URL,
        GEOCODING_PROVIDER: 'photon',
        ROUTING_PROVIDER: 'osrm',
        NOMINATIM_ENABLED: 'true',
      });

    expect(parse).toThrow(/- PHOTON_URL: is required/);
    expect(parse).toThrow(/- NOMINATIM_URL: is required/);
    expect(parse).toThrow(/- OSRM_URL: is required/);
  });

  it('requires_the_public_site_url_in_production', () => {
    const parse = () => parseEnv({ ...MINIMAL, NODE_ENV: 'production' });

    expect(parse).toThrow(/- PUBLIC_SITE_URL: is required in production/);
  });

  it('requires_a_long_server_fetch_secret_in_production_only', () => {
    expect(() => parseEnv({ ...PRODUCTION, SERVER_FETCH_SECRET: '' })).toThrow(
      /- SERVER_FETCH_SECRET: is required in production/,
    );
    expect(() => parseEnv({ ...PRODUCTION, SERVER_FETCH_SECRET: 'too-short' })).toThrow(
      /- SERVER_FETCH_SECRET: must be at least 32 characters/,
    );
    expect(parseEnv({ ...MINIMAL, SERVER_FETCH_SECRET: '  ' }).SERVER_FETCH_SECRET).toBeNull();
    expect(parseEnv(PRODUCTION).SERVER_FETCH_SECRET).toBe(PRODUCTION.SERVER_FETCH_SECRET);
  });

  it('reads_a_whole_number_trust_proxy_as_a_hop_count', () => {
    expect(parseEnv({ ...MINIMAL, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(parseEnv({ ...MINIMAL, TRUST_PROXY: 'loopback' }).TRUST_PROXY).toBe('loopback');
  });

  it('refuses_fake_providers_in_production', () => {
    const parse = () => parseEnv({ ...PRODUCTION, ALLOW_FAKE_PROVIDERS: 'false' });

    expect(parse).toThrow(/- GEOCODING_PROVIDER: fake is refused in production/);
    expect(parse).toThrow(/- ROUTING_PROVIDER: fake is refused in production/);
  });

  it('refuses_one_fake_provider_beside_a_real_one_in_production', () => {
    const parse = () =>
      parseEnv({
        ...PRODUCTION,
        ALLOW_FAKE_PROVIDERS: undefined,
        GEOCODING_PROVIDER: 'photon',
        PHOTON_URL: 'https://photon.komoot.io',
      });

    expect(parse).toThrow(/- ROUTING_PROVIDER: fake is refused in production/);
    expect(parse).not.toThrow(/GEOCODING_PROVIDER/);
  });

  it('accepts_fake_providers_in_production_when_explicitly_allowed', () => {
    const env = parseEnv(PRODUCTION);

    expect(env.GEOCODING_PROVIDER).toBe('fake');
    expect(env.ALLOW_FAKE_PROVIDERS).toBe(true);
  });

  it('names_every_missing_or_invalid_variable_in_one_readable_message', () => {
    const parse = () =>
      parseEnv({ ...MINIMAL, PORT: '0', DATABASE_URL: 'mysql://localhost/heremita' });

    expect(parse).toThrow(EnvValidationError);
    expect(parse).toThrow(/- PORT: .+\n {2}- DATABASE_URL: must be a PostgreSQL connection URL/);
  });

  it('rejects_a_missing_database_url_and_providers', () => {
    const parse = () => parseEnv({});

    expect(parse).toThrow(/- DATABASE_URL: /);
    expect(parse).toThrow(/- GEOCODING_PROVIDER: /);
  });
});
