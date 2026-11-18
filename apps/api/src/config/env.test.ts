import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.js';

const DATABASE_URL = 'postgresql://heremita:heremita@localhost:5434/heremita';
const MINIMAL = { DATABASE_URL, GEOCODING_PROVIDER: 'fake', ROUTING_PROVIDER: 'fake' };

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
    });
  });

  it('reads_the_port_as_a_number', () => {
    const env = parseEnv({ ...MINIMAL, PORT: '4000' });

    expect(env.PORT).toBe(4000);
  });

  it('defaults_secure_cookies_to_production_only', () => {
    const production = parseEnv({
      ...MINIMAL,
      NODE_ENV: 'production',
      PUBLIC_SITE_URL: 'https://heremita.example',
    });
    const overridden = parseEnv({
      ...MINIMAL,
      NODE_ENV: 'production',
      PUBLIC_SITE_URL: 'https://heremita.example',
      COOKIE_SECURE: 'false',
    });

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
