/**
 * Hermetic e2e environment (§I.env "E2E overrides"): own ports, own database,
 * fake providers, a blank map style. Never the dev servers (3100/3101).
 */

export const E2E_WEB_PORT = 3110;
export const E2E_API_PORT = 3111;

export const E2E_WEB_ORIGIN = `http://localhost:${E2E_WEB_PORT}`;
export const E2E_API_ORIGIN = `http://localhost:${E2E_API_PORT}`;

/** Dropped and recreated before every run; the name must end in `_e2e`. */
export const E2E_DATABASE_URL = 'postgresql://heremita:heremita@localhost:5434/heremita_e2e';

export const SESSION_COOKIE_NAME = 'hm_session';

const BLANK_STYLE = '/dev/blank-style.json';

/** Both production builds refuse to start without it; any 32+ characters, the same in both. */
const SERVER_FETCH_SECRET = 'e2e-only-server-fetch-secret-never-in-production';

/** Environment of the API production build under test. */
export const apiEnvironment = {
  NODE_ENV: 'production',
  PORT: String(E2E_API_PORT),
  DATABASE_URL: E2E_DATABASE_URL,
  WEB_ORIGIN: E2E_WEB_ORIGIN,
  PUBLIC_SITE_URL: E2E_WEB_ORIGIN,
  COOKIE_SECURE: 'false',
  TRUST_PROXY: 'loopback, uniquelocal',
  LOG_LEVEL: 'warn',
  GEOCODING_PROVIDER: 'fake',
  ROUTING_PROVIDER: 'fake',
  ALLOW_FAKE_PROVIDERS: 'true',
  NOMINATIM_ENABLED: 'false',
  SERVER_FETCH_SECRET,
} as const;

/** Environment of the web production build under test (read at build and at start). */
export const webEnvironment = {
  NODE_ENV: 'production',
  API_URL: E2E_API_ORIGIN,
  SESSION_COOKIE_NAME,
  NEXT_PUBLIC_MAP_STYLE_LIGHT: BLANK_STYLE,
  NEXT_PUBLIC_MAP_STYLE_DARK: BLANK_STYLE,
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT: BLANK_STYLE,
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK: BLANK_STYLE,
  NEXT_PUBLIC_E2E: '1',
  SERVER_FETCH_SECRET,
} as const;

/** Hosts a test page may reach; every other request is aborted. */
export function isLocalUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  if (protocol === 'data:' || protocol === 'blob:') {
    return true;
  }
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}
