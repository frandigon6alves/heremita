/**
 * Validation of the web app's environment. Plain functions with no server-only
 * marker, so `next.config.ts` can run them at build time (fail fast) and
 * `env.ts` / `public-env.ts` can run them at runtime.
 */

export const SESSION_COOKIE_NAMES = ['hm_session', '__Host-hm_session'] as const;
export type SessionCookieName = (typeof SESSION_COOKIE_NAMES)[number];

export const ENV_DEFAULTS = {
  API_URL: 'http://localhost:3101',
  NEXT_PUBLIC_MAP_STYLE_LIGHT: 'https://tiles.openfreemap.org/styles/positron',
  NEXT_PUBLIC_MAP_STYLE_DARK: 'https://tiles.openfreemap.org/styles/dark',
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT:
    'https://tiles.versatiles.org/assets/styles/colorful/style.json',
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK:
    'https://tiles.versatiles.org/assets/styles/eclipse/style.json',
} as const;

type Source = Readonly<Record<string, string | undefined>>;

export interface PublicEnv {
  NEXT_PUBLIC_MAP_STYLE_LIGHT: string;
  NEXT_PUBLIC_MAP_STYLE_DARK: string;
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT: string;
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK: string;
  NEXT_PUBLIC_E2E: boolean;
}

export interface ServerEnv extends PublicEnv {
  API_URL: string;
  SESSION_COOKIE_NAME: SessionCookieName;
  CONTACT_EMAIL: string | null;
  /** Signs the browser's address on server renders (`lib/api/server.ts`); `null` → not sent. */
  SERVER_FETCH_SECRET: string | null;
}

/** Shortest accepted `SERVER_FETCH_SECRET` (the API applies the same rule). */
export const SERVER_FETCH_SECRET_MIN_LENGTH = 32;

/** Thrown with every invalid variable listed, so one boot shows all problems. */
export class InvalidEnvError extends Error {
  override readonly name = 'InvalidEnvError';

  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
}

/** An empty string counts as unset: `.env` files often carry `NAME=`. */
function read(source: Source, name: string): string | undefined {
  const value = source[name]?.trim();
  return value === '' ? undefined : value;
}

function readUrl(source: Source, name: keyof typeof ENV_DEFAULTS, problems: string[]): string {
  const value = read(source, name) ?? ENV_DEFAULTS[name];
  if (!isHttpUrl(value)) {
    problems.push(`${name}: not an absolute http(s) URL (${value})`);
  }
  return value;
}

function isHttpUrl(value: string): boolean {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
}

/** Map styles may also be same-origin paths: e2e builds serve a blank style from `public/dev/`. */
function readStyleUrl(
  source: Source,
  name: Exclude<keyof typeof ENV_DEFAULTS, 'API_URL'>,
  problems: string[],
): string {
  const value = read(source, name) ?? ENV_DEFAULTS[name];
  const isSameOriginPath = value.startsWith('/') && !value.startsWith('//');
  if (!isSameOriginPath && !isHttpUrl(value)) {
    problems.push(`${name}: neither an absolute URL nor a path starting with / (${value})`);
  }
  return value;
}

function readPublic(source: Source, problems: string[]): PublicEnv {
  const e2e = read(source, 'NEXT_PUBLIC_E2E');
  if (e2e !== undefined && e2e !== '1') {
    problems.push(`NEXT_PUBLIC_E2E: must be 1 or unset (${e2e})`);
  }
  return {
    NEXT_PUBLIC_MAP_STYLE_LIGHT: readStyleUrl(source, 'NEXT_PUBLIC_MAP_STYLE_LIGHT', problems),
    NEXT_PUBLIC_MAP_STYLE_DARK: readStyleUrl(source, 'NEXT_PUBLIC_MAP_STYLE_DARK', problems),
    NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT: readStyleUrl(
      source,
      'NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT',
      problems,
    ),
    NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK: readStyleUrl(
      source,
      'NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK',
      problems,
    ),
    NEXT_PUBLIC_E2E: e2e === '1',
  };
}

function isSessionCookieName(value: string): value is SessionCookieName {
  return (SESSION_COOKIE_NAMES as readonly string[]).includes(value);
}

/** Variables the browser bundle sees (inlined by Next at build time). */
export function parsePublicEnv(source: Source): PublicEnv {
  const problems: string[] = [];
  const env = readPublic(source, problems);
  if (problems.length > 0) {
    throw new InvalidEnvError(problems);
  }
  return env;
}

export function parseServerEnv(source: Source): ServerEnv {
  const problems: string[] = [];
  const publicEnv = readPublic(source, problems);
  const apiUrl = readUrl(source, 'API_URL', problems);

  const cookieName = read(source, 'SESSION_COOKIE_NAME');
  if (cookieName === undefined || !isSessionCookieName(cookieName)) {
    problems.push(
      `SESSION_COOKIE_NAME: must be one of ${SESSION_COOKIE_NAMES.join(', ')} and match the API's COOKIE_SECURE (${cookieName ?? 'unset'})`,
    );
  }

  const contactEmail = read(source, 'CONTACT_EMAIL') ?? null;
  if (contactEmail !== null && !/^[^\s@]+@[^\s@]+$/.test(contactEmail)) {
    problems.push(`CONTACT_EMAIL: not an e-mail address (${contactEmail})`);
  }

  const serverFetchSecret = read(source, 'SERVER_FETCH_SECRET') ?? null;
  if (serverFetchSecret === null && read(source, 'NODE_ENV') === 'production') {
    problems.push(
      'SERVER_FETCH_SECRET: required in production, the same value as the API (generate one: openssl rand -base64 32)',
    );
  } else if (
    serverFetchSecret !== null &&
    serverFetchSecret.length < SERVER_FETCH_SECRET_MIN_LENGTH
  ) {
    problems.push(
      `SERVER_FETCH_SECRET: must be at least ${SERVER_FETCH_SECRET_MIN_LENGTH} characters (generate one: openssl rand -base64 32)`,
    );
  }

  if (problems.length > 0) {
    throw new InvalidEnvError(problems);
  }
  return {
    ...publicEnv,
    API_URL: apiUrl,
    SESSION_COOKIE_NAME: cookieName as SessionCookieName,
    CONTACT_EMAIL: contactEmail,
    SERVER_FETCH_SECRET: serverFetchSecret,
  };
}
