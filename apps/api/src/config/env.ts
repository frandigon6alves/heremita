import { z } from 'zod';

const booleanFlag = z.stringbool();

const httpUrl = z.url({ protocol: /^https?$/ });

const DEV_PUBLIC_SITE_URL = 'http://localhost:3100';

/** Environment variables the API needs. Validated once, at boot. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3101),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: 'must be a PostgreSQL connection URL (postgresql://user:password@host:port/database)',
    }),
    /** Exact origin of the web app: unsafe requests without `Sec-Fetch-Site` must send it as `Origin`. */
    WEB_ORIGIN: httpUrl
      .default('http://localhost:3100')
      .transform((value) => new URL(value).origin),
    /** Public address of the site, sent to map providers in `User-Agent` and `Referer`. */
    PUBLIC_SITE_URL: httpUrl.optional(),
    /** Unset: secure cookies in production only. */
    COOKIE_SECURE: booleanFlag.optional(),
    /**
     * Express `trust proxy` value: the proxies allowed to set `X-Forwarded-For`.
     * Either a list of addresses/subnets, or a whole number of hops (e.g. `2`
     * behind Vercel's rewrite plus Render's load balancer).
     */
    TRUST_PROXY: z
      .string()
      .trim()
      .min(1)
      .default('loopback, uniquelocal')
      .transform((value) => (/^\d+$/.test(value) ? Number(value) : value)),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
    GEOCODING_PROVIDER: z.enum(['photon', 'fake']),
    ROUTING_PROVIDER: z.enum(['osrm', 'fake']),
    /** Fake providers in a production build (end-to-end tests only). */
    ALLOW_FAKE_PROVIDERS: booleanFlag.default(false),
    PHOTON_URL: httpUrl.optional(),
    NOMINATIM_ENABLED: booleanFlag.default(false),
    NOMINATIM_URL: httpUrl.optional(),
    OSRM_URL: httpUrl.optional(),
    /** Password of the demo accounts the seed writes. */
    DEMO_PASSWORD: z.string().min(12).default('heremita-demo-2026'),
    /**
     * Shared with the web app: verifies the client address its server renders
     * sign (`core/http/client-address.ts`). Blank counts as unset; required in
     * production.
     */
    SERVER_FETCH_SECRET: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .min(32, 'must be at least 32 characters (generate one: openssl rand -base64 32)')
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    const requireWhen = (condition: boolean, key: keyof typeof env, reason: string) => {
      if (condition && env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `is required ${reason}` });
      }
    };
    requireWhen(env.NODE_ENV === 'production', 'PUBLIC_SITE_URL', 'in production');
    requireWhen(
      env.NODE_ENV === 'production',
      'SERVER_FETCH_SECRET',
      'in production (the same value as the web app; generate one: openssl rand -base64 32)',
    );
    requireWhen(
      env.GEOCODING_PROVIDER === 'photon',
      'PHOTON_URL',
      'when GEOCODING_PROVIDER=photon',
    );
    requireWhen(env.NOMINATIM_ENABLED, 'NOMINATIM_URL', 'when NOMINATIM_ENABLED=true');
    requireWhen(env.ROUTING_PROVIDER === 'osrm', 'OSRM_URL', 'when ROUTING_PROVIDER=osrm');
    if (env.NODE_ENV === 'production' && !env.ALLOW_FAKE_PROVIDERS) {
      for (const key of ['GEOCODING_PROVIDER', 'ROUTING_PROVIDER'] as const) {
        if (env[key] === 'fake') {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'fake is refused in production unless ALLOW_FAKE_PROVIDERS=true',
          });
        }
      }
    }
  })
  .transform(({ COOKIE_SECURE, PUBLIC_SITE_URL, SERVER_FETCH_SECRET, ...env }) => ({
    ...env,
    COOKIE_SECURE: COOKIE_SECURE ?? env.NODE_ENV === 'production',
    PUBLIC_SITE_URL: PUBLIC_SITE_URL ?? DEV_PUBLIC_SITE_URL,
    SERVER_FETCH_SECRET: SERVER_FETCH_SECRET ?? null,
  }));

export type Env = z.output<typeof envSchema>;

/** Thrown when the environment is incomplete or malformed. The message is meant for humans. */
export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
}

/** Parses and validates the given environment, or throws an {@link EnvValidationError}. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  throw new EnvValidationError(
    [
      'Invalid environment variables:',
      ...problems,
      'Fix them in apps/api/.env (see apps/api/.env.example) or in the process environment.',
    ].join('\n'),
  );
}
