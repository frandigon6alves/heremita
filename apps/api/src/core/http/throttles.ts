import type { ThrottleName } from '@heremita/shared';

/** One throttle window: at most `limit` requests per `ttl` milliseconds. */
export interface ThrottleWindow {
  limit: number;
  ttl: number;
}

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/** Every endpoint without a named throttle (§I.throttle "default"). */
export const DEFAULT_THROTTLE: ThrottleWindow = { limit: 120, ttl: MINUTE_MS };

/**
 * Per-endpoint limits (§I.throttle). All of them replace the limit of the single
 * `default` throttler, so each endpoint has one effective limit and the guard
 * answers a plain `Retry-After` header.
 */
export const THROTTLES: Record<ThrottleName, ThrottleWindow> = {
  auth: { limit: 10, ttl: MINUTE_MS },
  signup: { limit: 5, ttl: HOUR_MS },
  search: { limit: 10, ttl: 2 * SECOND_MS },
  reverse: { limit: 3, ttl: 3 * SECOND_MS },
  route: { limit: 5, ttl: 2_500 },
  ugc: { limit: 10, ttl: HOUR_MS },
  ai: { limit: 10, ttl: HOUR_MS },
};
