// The only place the API talks to the internet. Adapters build URLs and parse bodies;
// this client owns politeness (User-Agent, Referer, token buckets, one connection),
// resilience (timeouts, retries, breaker, pauses) and single-flight.
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { Clock } from '../../core/clock/clock.js';
import { CircuitBreaker, type CircuitBreakerConfig } from './circuit-breaker.js';
import { ConnectionGate } from './connection-gate.js';
import { ProviderError, type ProviderErrorKind } from './contract.js';
import { TokenBucket, type TokenBucketConfig } from './token-bucket.js';

export type UpstreamHost = 'photon' | 'nominatim' | 'osrm';

export interface HostPolicy {
  /** Provider id used in errors and logs. */
  provider: string;
  tokens: TokenBucketConfig;
  timeoutMs: number;
  /** Timeout of an as-you-type request; absent = the host must never get autocomplete traffic. */
  autocompleteTimeoutMs?: number;
  /** Longest wait for a free connection plus a token before giving up (`rate_limited`). */
  maxWaitMs: number;
  maxConnections: number;
  /** FOSSGIS answers 429 with an HTML page and no `Retry-After`: back off the whole host. */
  pauseOn429Ms?: number;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const HOST_POLICIES: Readonly<Record<UpstreamHost, HostPolicy>> = {
  // Photon publishes no number: our own cap.
  photon: {
    provider: 'photon',
    tokens: { capacity: 3, intervalMs: SECOND },
    timeoutMs: 5 * SECOND,
    autocompleteTimeoutMs: 4 * SECOND,
    maxWaitMs: 2 * SECOND,
    maxConnections: Number.POSITIVE_INFINITY,
  },
  // OSMF policy: absolute maximum 1 request per second, no autocomplete.
  nominatim: {
    provider: 'nominatim',
    tokens: { capacity: 1, intervalMs: 1.1 * SECOND },
    timeoutMs: 5 * SECOND,
    maxWaitMs: 2 * SECOND,
    maxConnections: 1,
  },
  // FOSSGIS terms: one request per second, scripts one connection.
  osrm: {
    provider: 'osrm-fossgis',
    tokens: { capacity: 1, intervalMs: SECOND },
    timeoutMs: 6 * SECOND,
    maxWaitMs: 3 * SECOND,
    maxConnections: 1,
    pauseOn429Ms: MINUTE,
  },
};

export const OUTBOUND_DEADLINE_MS = 8 * SECOND;
export const MAX_RETRIES = 2;
export const BACKOFF_BASE_MS = 250;
export const BACKOFF_CAP_MS = 2 * SECOND;
export const BREAKER: CircuitBreakerConfig = { failureThreshold: 5, openMs: 30 * SECOND };
/** 403 = our User-Agent or Referer got blocked: a human must act. */
export const PAUSE_ON_403_MS = HOUR;

export interface OutboundRequest {
  host: UpstreamHost;
  url: string;
  /** As-you-type search: shorter timeout, never retried, never waits for a token. */
  autocomplete?: boolean;
  signal?: AbortSignal;
}

export interface OutboundResponse {
  status: number;
  /** Parsed JSON body, or `null` when the body is not JSON. */
  body: unknown;
}

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export interface OutboundLogger {
  warn(message: string): void;
  error(message: string): void;
}

export interface OutboundOptions {
  /** `PUBLIC_SITE_URL`: identifies us in `User-Agent` and `Referer`. */
  publicSiteUrl: string;
  clock: Clock;
  logger: OutboundLogger;
  /** Waits for backoff and tokens. Tests advance a `FixedClock` instead of sleeping. */
  sleep?: Sleep;
  /** Jitter source in [0, 1). Tests pass a seeded one. */
  random?: () => number;
  /** Test-only overrides of the per-host policy. */
  policies?: Partial<Record<UpstreamHost, Partial<HostPolicy>>>;
}

const sleepFor: Sleep = (ms, signal) => delay(ms, undefined, { signal });

/** Version of the API package, read once (`Heremita/<version>` in the User-Agent). */
const API_VERSION = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export function upstreamHeaders(publicSiteUrl: string): Record<string, string> {
  const site = publicSiteUrl.replace(/\/+$/, '');
  return {
    'User-Agent': `Heremita/${API_VERSION} (+${site}/about)`,
    Referer: `${site}/`,
    Accept: 'application/json',
  };
}

/** `Retry-After` as seconds (delta-seconds or HTTP-date), or undefined. */
export function parseRetryAfter(value: string | null, now: Date): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }
  if (/^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now.getTime()) / SECOND));
}

interface HostState {
  policy: HostPolicy;
  bucket: TokenBucket;
  breaker: CircuitBreaker;
  gate: ConnectionGate;
  pausedUntil: number;
}

/** What one attempt produced: an answer to hand back, or a failure that may be retried. */
type Attempt =
  | { kind: 'answer'; response: OutboundResponse }
  | {
      kind: 'failure';
      error: ProviderError;
      /** Counts against the breaker (network error, timeout, 5xx). */
      hostFault: boolean;
      /** Another attempt may succeed (host faults and a plain 429). */
      retry: boolean;
      retryAfterSeconds?: number;
    };

interface Flight {
  promise: Promise<OutboundResponse>;
  controller: AbortController;
  callers: number;
}

export class OutboundClient {
  private readonly hosts: Record<UpstreamHost, HostState>;
  private readonly headers: Record<string, string>;
  private readonly clock: Clock;
  private readonly logger: OutboundLogger;
  private readonly sleep: Sleep;
  private readonly random: () => number;
  private readonly flights = new Map<string, Flight>();

  constructor(options: OutboundOptions) {
    this.clock = options.clock;
    this.logger = options.logger;
    this.sleep = options.sleep ?? sleepFor;
    this.random = options.random ?? Math.random;
    this.headers = upstreamHeaders(options.publicSiteUrl);
    const state = (host: UpstreamHost): HostState => {
      const policy = { ...HOST_POLICIES[host], ...options.policies?.[host] };
      return {
        policy,
        // SHORTCUT(owner): upstream token buckets, breakers and pauses live in API process memory — ceiling: one API instance, state resets on restart; upgrade: before a second API instance runs, move them to a Postgres-backed store
        bucket: new TokenBucket(policy.tokens, this.clock),
        breaker: new CircuitBreaker(BREAKER, this.clock),
        gate: new ConnectionGate(policy.maxConnections),
        pausedUntil: 0,
      };
    };
    this.hosts = { photon: state('photon'), nominatim: state('nominatim'), osrm: state('osrm') };
  }

  /**
   * GETs `url` from `host`. Resolves with 2xx and with 4xx answers other than
   * 403/429 (an OSRM 400 is an answer); throws `ProviderError` for everything
   * else. Identical concurrent requests share one upstream call.
   */
  async get(request: OutboundRequest): Promise<OutboundResponse> {
    const host = this.hosts[request.host];
    if (request.autocomplete && host.policy.autocompleteTimeoutMs === undefined) {
      throw new Error(`${host.policy.provider} must never receive autocomplete requests`);
    }
    request.signal?.throwIfAborted();
    const key = `${request.host}|${request.autocomplete ? 'ac' : 'go'}|${request.url}`;
    let flight = this.flights.get(key);
    if (!flight) {
      const controller = new AbortController();
      const promise = this.send(host, request, controller.signal).finally(() => {
        this.flights.delete(key);
      });
      flight = { promise, controller, callers: 0 };
      this.flights.set(key, flight);
    }
    return this.join(flight, request.signal);
  }

  /** Waits for a shared flight; the flight is aborted once every caller has given up. */
  private async join(flight: Flight, signal: AbortSignal | undefined): Promise<OutboundResponse> {
    flight.callers += 1;
    if (!signal) {
      return flight.promise;
    }
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        flight.callers -= 1;
        if (flight.callers === 0) {
          flight.controller.abort(signal.reason);
        }
        reject(signal.reason as Error);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([flight.promise, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort!);
    }
  }

  private async send(
    host: HostState,
    request: OutboundRequest,
    signal: AbortSignal,
  ): Promise<OutboundResponse> {
    const { policy } = host;
    const deadline = this.now() + OUTBOUND_DEADLINE_MS;
    const autocomplete = request.autocomplete === true;
    const maxRetries = autocomplete ? 0 : MAX_RETRIES;
    for (let attempt = 0; ; attempt += 1) {
      const release = await this.admit(host, autocomplete, deadline, signal);
      let result: Attempt;
      try {
        const timeoutMs = Math.min(
          autocomplete ? policy.autocompleteTimeoutMs! : policy.timeoutMs,
          deadline - this.now(),
        );
        result = await this.attempt(host, request.url, timeoutMs, signal);
      } catch (error) {
        host.breaker.abandonProbe();
        throw error;
      } finally {
        release();
      }
      if (result.kind === 'answer') {
        host.breaker.recordAnswer();
        return result.response;
      }
      if (result.hostFault) {
        host.breaker.recordFailure();
      } else {
        host.breaker.recordAnswer();
      }
      const waitMs =
        result.retry && attempt < maxRetries ? this.backoff(attempt, result) : undefined;
      if (waitMs === undefined || this.now() + waitMs >= deadline) {
        throw result.error;
      }
      this.logger.warn(
        `Upstream ${policy.provider} attempt ${attempt + 1} failed (${result.error.kind}); retrying in ${waitMs} ms`,
      );
      await this.sleep(waitMs, signal);
    }
  }

  /** Full jitter from 250 ms doubling, capped at 2 s; a longer `Retry-After` wins. */
  private backoff(attempt: number, result: Extract<Attempt, { kind: 'failure' }>): number {
    const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
    const jitter = Math.floor(this.random() * ceiling);
    return Math.max(jitter, (result.retryAfterSeconds ?? 0) * SECOND);
  }

  /**
   * Gets the request past the pause, the breaker, the connection gate and the
   * token bucket, within the host's wait budget. Returns the connection release.
   */
  private async admit(
    host: HostState,
    autocomplete: boolean,
    deadline: number,
    signal: AbortSignal,
  ): Promise<() => void> {
    const { policy } = host;
    const pausedMs = host.pausedUntil - this.now();
    if (pausedMs > 0) {
      throw this.rateLimited(policy, 'host paused after a refusal', pausedMs);
    }
    if (host.breaker.state === 'open') {
      throw this.circuitOpen(host);
    }
    const budgetMs = Math.max(
      0,
      Math.min(autocomplete ? 0 : policy.maxWaitMs, deadline - this.now()),
    );
    const startedAt = this.now();
    let release: () => void;
    try {
      release = await host.gate.acquire(AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]));
    } catch (error) {
      signal.throwIfAborted();
      throw this.rateLimited(policy, 'no free connection in time', SECOND, error);
    }
    try {
      for (let waitMs = host.bucket.tryTake(); waitMs > 0; waitMs = host.bucket.tryTake()) {
        if (this.now() - startedAt + waitMs > budgetMs) {
          throw this.rateLimited(policy, 'no token in time', waitMs);
        }
        await this.sleep(waitMs, signal);
      }
      // Last gate: in half-open state only one probe may go out.
      if (!host.breaker.tryPass()) {
        throw this.circuitOpen(host);
      }
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }

  private circuitOpen(host: HostState): ProviderError {
    return new ProviderError(host.policy.provider, 'unavailable', 'circuit open', {
      retryAfterSeconds: Math.max(1, Math.ceil(host.breaker.remainingOpenMs() / SECOND)),
    });
  }

  private async attempt(
    host: HostState,
    url: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<Attempt> {
    const { policy } = host;
    const timeout = AbortSignal.timeout(Math.max(timeoutMs, 1));
    let response: Response;
    let body: unknown;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        redirect: 'error',
        signal: AbortSignal.any([signal, timeout]),
      });
      const text = await response.text();
      body = parseJson(text);
    } catch (error) {
      signal.throwIfAborted();
      const kind: ProviderErrorKind = timeout.aborted ? 'timeout' : 'unavailable';
      return {
        kind: 'failure',
        hostFault: true,
        retry: true,
        error: new ProviderError(policy.provider, kind, `${kind} calling ${policy.provider}`, {
          cause: error,
        }),
      };
    }
    const status = response.status;
    const retryAfterSeconds = parseRetryAfter(
      response.headers.get('retry-after'),
      this.clock.now(),
    );
    if (status === 403) {
      host.pausedUntil = this.now() + PAUSE_ON_403_MS;
      this.logger.error(
        `Upstream ${policy.provider} answered 403: User-Agent or Referer blocked; host paused for 1 h`,
      );
      return {
        kind: 'failure',
        hostFault: false,
        retry: false,
        error: this.rateLimited(policy, 'refused with 403', PAUSE_ON_403_MS),
      };
    }
    if (status === 429) {
      if (policy.pauseOn429Ms !== undefined) {
        const pauseMs = Math.max(policy.pauseOn429Ms, (retryAfterSeconds ?? 0) * SECOND);
        host.pausedUntil = this.now() + pauseMs;
        this.logger.warn(`Upstream ${policy.provider} answered 429; host paused for ${pauseMs} ms`);
        return {
          kind: 'failure',
          hostFault: false,
          retry: false,
          error: this.rateLimited(policy, 'throttled with 429', pauseMs),
        };
      }
      return {
        kind: 'failure',
        hostFault: false,
        retry: true,
        retryAfterSeconds,
        error: this.rateLimited(policy, 'throttled with 429', (retryAfterSeconds ?? 1) * SECOND),
      };
    }
    if (status >= 500) {
      return {
        kind: 'failure',
        hostFault: true,
        retry: true,
        retryAfterSeconds,
        error: new ProviderError(
          policy.provider,
          'unavailable',
          `${policy.provider} answered ${status}`,
        ),
      };
    }
    return { kind: 'answer', response: { status, body } };
  }

  private rateLimited(
    policy: HostPolicy,
    message: string,
    waitMs: number,
    cause?: unknown,
  ): ProviderError {
    return new ProviderError(policy.provider, 'rate_limited', message, {
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / SECOND)),
      cause,
    });
  }

  private now(): number {
    return this.clock.now().getTime();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
