import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../../core/clock/fixed-clock.js';
import { ProviderError } from './contract.js';
import {
  HOST_POLICIES,
  OutboundClient,
  parseRetryAfter,
  type HostPolicy,
  type OutboundOptions,
  type UpstreamHost,
} from './outbound.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A local upstream stand-in: answers with queued handlers, then with the default. */
class StubServer {
  readonly requests: IncomingMessage[] = [];
  readonly queue: Handler[] = [];
  fallback: Handler = (_req, res) => json(res, 200, { ok: true });
  active = 0;
  maxActive = 0;
  private server!: Server;

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      this.requests.push(req);
      this.active += 1;
      this.maxActive = Math.max(this.maxActive, this.active);
      res.on('close', () => {
        this.active -= 1;
      });
      (this.queue.shift() ?? this.fallback)(req, res);
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  url(path = '/api/?q=lisboa'): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}${path}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

const answer =
  (status: number, body: unknown = {}, headers: Record<string, string> = {}): Handler =>
  (_req, res) =>
    json(res, status, body, headers);

const hang: Handler = () => undefined;

class Recorder {
  readonly warnings: string[] = [];
  readonly errors: string[] = [];
  warn(message: string): void {
    this.warnings.push(message);
  }
  error(message: string): void {
    this.errors.push(message);
  }
}

let stub: StubServer;
let clock: FixedClock;
let sleeps: number[];
let logger: Recorder;

function client(overrides: Partial<OutboundOptions> = {}): OutboundClient {
  return new OutboundClient({
    publicSiteUrl: 'https://heremita.example/',
    clock,
    logger,
    // Waiting moves the injected clock instead of real time.
    sleep: (ms) => {
      sleeps.push(ms);
      clock.advance(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    ...overrides,
  });
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

beforeEach(async () => {
  stub = new StubServer();
  await stub.start();
  clock = new FixedClock('2026-11-18T10:00:00.000Z');
  sleeps = [];
  logger = new Recorder();
});

afterEach(async () => {
  await stub.stop();
});

describe('OutboundClient headers', () => {
  it('identifies_heremita_in_user_agent_and_referer', async () => {
    await client().get({ host: 'photon', url: stub.url() });

    const headers = stub.requests[0]!.headers;
    expect(headers['user-agent']).toMatch(
      /^Heremita\/\d+\.\d+\.\d+ \(\+https:\/\/heremita\.example\/about\)$/,
    );
    expect(headers.referer).toBe('https://heremita.example/');
  });

  it('sends_no_cookie_or_authorization', async () => {
    await client().get({ host: 'osrm', url: stub.url() });

    const headers = stub.requests[0]!.headers;
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });
});

describe('OutboundClient answers', () => {
  it('returns_the_parsed_json_of_a_success', async () => {
    stub.queue.push(answer(200, { features: [] }));

    const response = await client().get({ host: 'photon', url: stub.url() });

    expect(response).toEqual({ status: 200, body: { features: [] } });
  });

  it('returns_a_4xx_answer_without_retrying', async () => {
    stub.queue.push(
      answer(400, {
        code: 'NoSegment',
        message: 'Could not find a matching segment for coordinate 2',
      }),
    );

    const response = await client().get({ host: 'osrm', url: stub.url() });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'NoSegment' });
    expect(stub.requests).toHaveLength(1);
  });

  it('returns_null_body_when_the_answer_is_not_json', async () => {
    stub.queue.push((_req, res) => res.writeHead(404).end('<html>nope</html>'));

    const response = await client().get({ host: 'photon', url: stub.url() });

    expect(response).toEqual({ status: 404, body: null });
  });
});

describe('OutboundClient token buckets', () => {
  it('lets_a_photon_burst_of_3_through_then_waits_1_s', async () => {
    const outbound = client();

    for (let i = 0; i < 4; i += 1) {
      await outbound.get({ host: 'photon', url: stub.url(`/api/?q=${i}`) });
    }

    expect(stub.requests).toHaveLength(4);
    expect(sleeps).toEqual([1_000]);
  });

  it('fails_autocomplete_fast_when_photon_has_no_token', async () => {
    const outbound = client();
    for (let i = 0; i < 3; i += 1) {
      await outbound.get({ host: 'photon', url: stub.url(`/api/?q=${i}`), autocomplete: true });
    }

    const error = await failure(
      outbound.get({ host: 'photon', url: stub.url('/api/?q=x'), autocomplete: true }),
    );

    expect(error.kind).toBe('rate_limited');
    expect(error.retryAfterSeconds).toBe(1);
    expect(stub.requests).toHaveLength(3);
    expect(sleeps).toEqual([]);
  });

  it('gives_up_on_nominatim_after_2_s_without_a_token', async () => {
    const outbound = client({
      policies: { nominatim: { tokens: { capacity: 1, intervalMs: 2_500 } } },
    });
    await outbound.get({ host: 'nominatim', url: stub.url('/lookup?osm_ids=W1') });

    const error = await failure(
      outbound.get({ host: 'nominatim', url: stub.url('/lookup?osm_ids=W2') }),
    );

    expect(error.kind).toBe('rate_limited');
    expect(stub.requests).toHaveLength(1);
  });

  it('spaces_nominatim_calls_1_1_s_apart', async () => {
    const outbound = client();

    await outbound.get({ host: 'nominatim', url: stub.url('/lookup?osm_ids=W1') });
    await outbound.get({ host: 'nominatim', url: stub.url('/lookup?osm_ids=W2') });

    expect(sleeps).toEqual([1_100]);
  });

  it('keeps_osrm_to_one_request_per_second', async () => {
    const outbound = client();

    for (let i = 0; i < 3; i += 1) {
      await outbound.get({ host: 'osrm', url: stub.url(`/routed-foot/route/v1/driving/${i}`) });
    }

    expect(sleeps).toEqual([1_000, 1_000]);
  });

  it('keeps_one_connection_open_to_osrm', async () => {
    const outbound = client({ policies: { osrm: { tokens: { capacity: 5, intervalMs: 1_000 } } } });
    stub.fallback = (_req, res) => {
      setTimeout(() => json(res, 200, { code: 'Ok' }), 20);
    };

    await Promise.all(
      [1, 2, 3].map((i) =>
        outbound.get({ host: 'osrm', url: stub.url(`/routed-car/route/v1/driving/${i}`) }),
      ),
    );

    expect(stub.requests).toHaveLength(3);
    expect(stub.maxActive).toBe(1);
  });

  it('does_not_limit_photon_connections', async () => {
    const outbound = client();
    stub.fallback = (_req, res) => {
      setTimeout(() => json(res, 200, {}), 20);
    };

    await Promise.all(
      [1, 2, 3].map((i) => outbound.get({ host: 'photon', url: stub.url(`/api/?q=${i}`) })),
    );

    expect(stub.maxActive).toBe(3);
  });

  it.each([
    ['photon', 3, 1_000],
    ['nominatim', 1, 1_100],
    ['osrm', 1, 1_000],
  ] as const)('caps_%s_at_burst_%i_and_one_token_per_%i_ms', (host, capacity, intervalMs) => {
    expect(HOST_POLICIES[host].tokens).toEqual({ capacity, intervalMs });
  });

  it('allows_one_connection_to_nominatim_and_osrm_only', () => {
    expect(HOST_POLICIES.nominatim.maxConnections).toBe(1);
    expect(HOST_POLICIES.osrm.maxConnections).toBe(1);
  });
});

describe('OutboundClient timeouts', () => {
  it.each([
    ['photon', 5_000],
    ['nominatim', 5_000],
    ['osrm', 6_000],
  ] as const)('gives_%s_%i_ms_per_attempt', (host, timeoutMs) => {
    expect(HOST_POLICIES[host].timeoutMs).toBe(timeoutMs);
  });

  it('gives_photon_autocomplete_4_s', () => {
    expect(HOST_POLICIES.photon.autocompleteTimeoutMs).toBe(4_000);
  });

  it('aborts_an_attempt_that_outlives_its_timeout', async () => {
    stub.fallback = hang;
    const outbound = client({ policies: { photon: { timeoutMs: 30 } } });

    const error = await failure(outbound.get({ host: 'photon', url: stub.url() }));

    expect(error.kind).toBe('timeout');
    expect(error.retryable).toBe(true);
    expect(stub.requests).toHaveLength(3);
  });
});

describe('OutboundClient retries', () => {
  it('retries_a_5xx_at_most_twice', async () => {
    stub.fallback = answer(503);

    const error = await failure(client().get({ host: 'photon', url: stub.url() }));

    expect(error.kind).toBe('unavailable');
    expect(stub.requests).toHaveLength(3);
    expect(logger.warnings).toHaveLength(2);
  });

  it('succeeds_when_a_retry_does', async () => {
    stub.queue.push(answer(502), answer(200, { features: [] }));

    const response = await client().get({ host: 'photon', url: stub.url() });

    expect(response.status).toBe(200);
    expect(stub.requests).toHaveLength(2);
  });

  it('waits_with_full_jitter_doubling_from_250_ms', async () => {
    stub.fallback = answer(500);
    const draws = [0.5, 0.9];
    const outbound = client({ random: () => draws.shift()! });

    await failure(outbound.get({ host: 'photon', url: stub.url() }));

    expect(sleeps).toEqual([125, 450]);
  });

  it('caps_backoff_at_2_s', async () => {
    stub.fallback = answer(500);
    const outbound = client({
      random: () => 0.999,
      policies: { photon: { tokens: { capacity: 100, intervalMs: 1 } } },
    });

    await failure(outbound.get({ host: 'photon', url: stub.url() }));

    expect(Math.max(...sleeps)).toBeLessThanOrEqual(2_000);
  });

  it('retries_a_network_error', async () => {
    stub.queue.push((req) => req.socket.destroy(), answer(200, {}));

    const response = await client().get({ host: 'photon', url: stub.url() });

    expect(response.status).toBe(200);
    expect(stub.requests).toHaveLength(2);
  });

  it('honours_retry_after_on_a_429', async () => {
    stub.queue.push(answer(429, {}, { 'retry-after': '3' }), answer(200, {}));

    const response = await client().get({ host: 'photon', url: stub.url() });

    expect(response.status).toBe(200);
    expect(sleeps).toEqual([3_000]);
  });

  it('does_not_retry_when_retry_after_passes_the_8_s_deadline', async () => {
    stub.fallback = answer(429, {}, { 'retry-after': '9' });

    const error = await failure(client().get({ host: 'photon', url: stub.url() }));

    expect(error.kind).toBe('rate_limited');
    expect(error.retryAfterSeconds).toBe(9);
    expect(stub.requests).toHaveLength(1);
  });

  it('never_retries_past_the_8_s_deadline', async () => {
    stub.fallback = answer(503, {}, { 'retry-after': '5' });

    await failure(client().get({ host: 'photon', url: stub.url() }));

    expect(stub.requests).toHaveLength(2);
    expect(sleeps).toEqual([5_000]);
  });

  it('never_retries_autocomplete', async () => {
    stub.fallback = answer(503);

    const error = await failure(
      client().get({ host: 'photon', url: stub.url(), autocomplete: true }),
    );

    expect(error.kind).toBe('unavailable');
    expect(stub.requests).toHaveLength(1);
  });

  it('never_sends_autocomplete_to_nominatim', async () => {
    await expect(
      client().get({ host: 'nominatim', url: stub.url('/search?q=lis'), autocomplete: true }),
    ).rejects.toThrow(/never receive autocomplete/);
    expect(stub.requests).toHaveLength(0);
  });
});

describe('OutboundClient pauses', () => {
  it('pauses_osrm_for_60_s_after_a_429', async () => {
    stub.queue.push((_req, res) =>
      res.writeHead(429, { 'content-type': 'text/html' }).end('<h1>Too many</h1>'),
    );
    const outbound = client();

    const first = await failure(outbound.get({ host: 'osrm', url: stub.url('/routed-foot/1') }));
    clock.advance(59_000);
    const during = await failure(outbound.get({ host: 'osrm', url: stub.url('/routed-foot/2') }));
    clock.advance(1_000);
    const after = await outbound.get({ host: 'osrm', url: stub.url('/routed-foot/3') });

    expect(first.kind).toBe('rate_limited');
    expect(first.retryAfterSeconds).toBe(60);
    expect(during.kind).toBe('rate_limited');
    expect(after.status).toBe(200);
    expect(stub.requests).toHaveLength(2);
  });

  it('pauses_a_host_for_1_h_and_logs_an_error_after_a_403', async () => {
    stub.queue.push(answer(403));
    const outbound = client();

    await failure(outbound.get({ host: 'photon', url: stub.url('/api/?q=a') }));
    clock.advance(3_599_000);
    const during = await failure(outbound.get({ host: 'photon', url: stub.url('/api/?q=b') }));
    clock.advance(1_000);
    await outbound.get({ host: 'photon', url: stub.url('/api/?q=c') });

    expect(during.kind).toBe('rate_limited');
    expect(stub.requests).toHaveLength(2);
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toMatch(/403/);
  });

  it('keeps_other_hosts_running_while_one_is_paused', async () => {
    stub.queue.push(answer(403));
    const outbound = client();

    await failure(outbound.get({ host: 'photon', url: stub.url() }));
    const osrm = await outbound.get({ host: 'osrm', url: stub.url('/routed-car/1') });

    expect(osrm.status).toBe(200);
  });
});

describe('OutboundClient circuit breaker', () => {
  const roomy: Partial<Record<UpstreamHost, Partial<HostPolicy>>> = {
    photon: { tokens: { capacity: 100, intervalMs: 1 } },
  };

  it('opens_after_5_consecutive_failures_and_fails_fast', async () => {
    stub.fallback = answer(503);
    const outbound = client({ policies: roomy });
    await failure(outbound.get({ host: 'photon', url: stub.url('/api/?q=1') }));
    await failure(outbound.get({ host: 'photon', url: stub.url('/api/?q=2') }));
    const sent = stub.requests.length;

    const error = await failure(outbound.get({ host: 'photon', url: stub.url('/api/?q=3') }));

    expect(sent).toBe(5);
    expect(error.kind).toBe('unavailable');
    expect(error.message).toBe('circuit open');
    expect(stub.requests).toHaveLength(5);
  });

  it('probes_once_after_30_s_and_closes_on_success', async () => {
    stub.fallback = answer(503);
    const outbound = client({ policies: roomy });
    await failure(outbound.get({ host: 'photon', url: stub.url('/api/?q=1') }));
    await failure(outbound.get({ host: 'photon', url: stub.url('/api/?q=2') }));
    stub.fallback = answer(200, {});

    clock.advance(30_000);
    const probe = await outbound.get({ host: 'photon', url: stub.url('/api/?q=3') });
    const next = await outbound.get({ host: 'photon', url: stub.url('/api/?q=4') });

    expect(probe.status).toBe(200);
    expect(next.status).toBe(200);
    expect(stub.requests).toHaveLength(7);
  });

  it('does_not_count_4xx_answers_as_failures', async () => {
    stub.fallback = answer(400, { message: 'bad' });
    const outbound = client({ policies: roomy });

    for (let i = 0; i < 6; i += 1) {
      await outbound.get({ host: 'photon', url: stub.url(`/api/?q=${i}`) });
    }

    expect(stub.requests).toHaveLength(6);
  });
});

describe('OutboundClient single-flight', () => {
  it('shares_one_upstream_call_between_identical_requests', async () => {
    stub.fallback = (_req, res) => {
      setTimeout(() => json(res, 200, { n: 1 }), 20);
    };
    const outbound = client();

    const [a, b] = await Promise.all([
      outbound.get({ host: 'photon', url: stub.url() }),
      outbound.get({ host: 'photon', url: stub.url() }),
    ]);

    expect(a.body).toEqual({ n: 1 });
    expect(b.body).toEqual({ n: 1 });
    expect(stub.requests).toHaveLength(1);
  });

  it('keeps_the_shared_call_alive_while_one_caller_still_waits', async () => {
    stub.fallback = (_req, res) => {
      setTimeout(() => json(res, 200, { n: 1 }), 30);
    };
    const outbound = client();
    const leaving = new AbortController();

    const gone = outbound.get({ host: 'photon', url: stub.url(), signal: leaving.signal });
    const staying = outbound.get({ host: 'photon', url: stub.url() });
    leaving.abort(new Error('user typed on'));

    await expect(gone).rejects.toThrow('user typed on');
    await expect(staying).resolves.toMatchObject({ body: { n: 1 } });
  });

  it('aborts_the_upstream_call_when_every_caller_gives_up', async () => {
    stub.fallback = hang;
    const outbound = client();
    const controller = new AbortController();

    const call = outbound.get({ host: 'photon', url: stub.url(), signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort(new Error('navigated away'));

    await expect(call).rejects.toThrow('navigated away');
    await expect.poll(() => stub.active).toBe(0);
  });
});

describe('network lockdown', () => {
  it('fails_a_request_to_a_real_host_as_unavailable_without_leaving_the_machine', async () => {
    const error = await failure(
      client({ random: () => 0 }).get({
        host: 'photon',
        url: 'https://photon.komoot.io/api/?q=lisboa',
      }),
    );

    expect(error.kind).toBe('unavailable');
  });
});

describe('parseRetryAfter', () => {
  const now = new Date('2026-11-18T10:00:00.000Z');

  it('reads_delta_seconds', () => {
    expect(parseRetryAfter('120', now)).toBe(120);
  });

  it('reads_an_http_date', () => {
    expect(parseRetryAfter('Wed, 18 Nov 2026 10:00:30 GMT', now)).toBe(30);
  });

  it('ignores_missing_or_garbage_values', () => {
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter('soon', now)).toBeUndefined();
  });
});
