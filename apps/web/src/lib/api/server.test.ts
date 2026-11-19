import { createHmac } from 'node:crypto';
import { endpoints, type Me } from '@heremita/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, HttpError } from './problem';

// Boundaries this module does not own: the RSC-only guard and the request scope of Next.
vi.mock('server-only', () => ({}));
const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  headers: new Headers(),
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = request.cookies.get(name);
        return value === undefined ? undefined : { name, value };
      },
      has: (name: string) => request.cookies.has(name),
    }),
  headers: () => Promise.resolve(request.headers),
}));
const SECRET = 'web-test-secret-0123456789abcdefghij';
const testEnv = vi.hoisted(() => ({
  API_URL: 'http://api.test',
  SESSION_COOKIE_NAME: 'hm_session',
  SERVER_FETCH_SECRET: null as string | null,
}));
vi.mock('@/env', () => ({ env: testEnv }));

const { getViewer, serverFetch } = await import('./server');

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  request.cookies = new Map();
  request.headers = new Headers();
  testEnv.SERVER_FETCH_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
});

const me: Me = {
  id: '0195f0c8-0000-7000-8000-000000000001',
  email: 'ana@example.com',
  displayName: 'Ana',
  locale: 'en',
  theme: 'dark',
  role: 'user',
  isDemo: false,
  createdAt: '2026-11-18T10:00:00.000Z',
};

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: `urn:heremita:problem:${code}`,
      title: code,
      status,
      detail: code,
      instance: '/api/v1/me',
      code,
    },
    { status },
  );
}

describe('serverFetch', () => {
  it('forwards_only_the_session_cookie_and_a_request_id', async () => {
    request.cookies = new Map([
      ['hm_session', 'token-1'],
      ['NEXT_LOCALE', 'en'],
      ['other', 'x'],
    ]);
    request.headers = new Headers({
      authorization: 'Bearer leak',
      'x-request-id': 'incoming-1234',
    });
    let sent: Headers | undefined;
    server.use(
      http.get('http://api.test/api/v1/me', ({ request: apiRequest }) => {
        sent = apiRequest.headers;
        return HttpResponse.json(me);
      }),
    );

    await serverFetch(endpoints.getMe);

    expect(sent?.get('cookie')).toBe('hm_session=token-1');
    expect(sent?.get('x-request-id')).toBe('incoming-1234');
    expect(sent?.get('authorization')).toBeNull();
    expect(sent?.get('x-heremita-client-ip')).toBeNull();
    expect(sent?.get('x-heremita-client-ip-signature')).toBeNull();
  });

  async function headersSentFor(incoming: Record<string, string>): Promise<Headers> {
    request.headers = new Headers(incoming);
    let sent: Headers | undefined;
    server.use(
      http.get('http://api.test/api/v1/public-trips', ({ request: apiRequest }) => {
        sent = apiRequest.headers;
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );
    await serverFetch(endpoints.listPublicTrips, { query: { limit: 6 } });
    if (!sent) {
      throw new Error('The API was not called');
    }
    return sent;
  }

  it('signs_the_browser_address_the_proxy_reported_with_the_shared_secret', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-11-19T10:00:00.000Z') });
    const now = Date.now();

    const sent = await headersSentFor({ 'x-forwarded-for': '198.51.100.1, 203.0.113.7' });

    const mac = createHmac('sha256', SECRET)
      .update(`heremita-client-ip:v1\n203.0.113.7\n${now}`)
      .digest('hex');
    expect(sent.get('x-heremita-client-ip')).toBe('203.0.113.7');
    expect(sent.get('x-heremita-client-ip-signature')).toBe(`${now}.${mac}`);
  });

  it('sends_no_address_without_a_secret_or_a_valid_forwarded_address', async () => {
    const unknown = await headersSentFor({ 'x-forwarded-for': 'unknown' });
    testEnv.SERVER_FETCH_SECRET = null;
    const unsigned = await headersSentFor({ 'x-forwarded-for': '203.0.113.7' });

    for (const sent of [unknown, unsigned]) {
      expect(sent.get('x-heremita-client-ip')).toBeNull();
      expect(sent.get('x-heremita-client-ip-signature')).toBeNull();
    }
  });

  it('generates_a_request_id_when_the_incoming_one_is_invalid', async () => {
    request.headers = new Headers({ 'x-request-id': 'bad id!' });
    let requestId: string | null = null;
    server.use(
      http.get('http://api.test/api/v1/public-trips', ({ request: apiRequest }) => {
        requestId = apiRequest.headers.get('x-request-id');
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    await serverFetch(endpoints.listPublicTrips, { query: { limit: 6 } });

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('throws_the_problem_of_a_failed_call', async () => {
    server.use(
      http.get('http://api.test/api/v1/trips/:tripId', () => problem(404, 'trip_not_found')),
    );

    await expect(
      serverFetch(endpoints.getTrip, { params: { tripId: 't1' } }),
    ).rejects.toMatchObject({
      code: 'trip_not_found',
    });
  });
});

describe('getViewer', () => {
  it('is_null_without_a_session_cookie_and_does_not_call_the_api', async () => {
    await expect(getViewer()).resolves.toBeNull();
  });

  it('returns_the_signed_in_user', async () => {
    request.cookies = new Map([['hm_session', 'token-1']]);
    server.use(http.get('http://api.test/api/v1/me', () => HttpResponse.json(me)));

    await expect(getViewer()).resolves.toEqual(me);
  });

  it('is_null_when_the_session_expired', async () => {
    request.cookies = new Map([['hm_session', 'expired']]);
    server.use(http.get('http://api.test/api/v1/me', () => problem(401, 'unauthenticated')));

    await expect(getViewer()).resolves.toBeNull();
  });

  it('throws_other_failures', async () => {
    request.cookies = new Map([['hm_session', 'token-1']]);
    server.use(http.get('http://api.test/api/v1/me', () => problem(503, 'database_unavailable')));

    await expect(getViewer()).rejects.toBeInstanceOf(ApiProblemError);
  });

  it('throws_http_error_when_the_api_is_unreachable_behind_a_proxy', async () => {
    request.cookies = new Map([['hm_session', 'token-1']]);
    server.use(
      http.get('http://api.test/api/v1/me', () => new HttpResponse(null, { status: 502 })),
    );

    await expect(getViewer()).rejects.toBeInstanceOf(HttpError);
  });
});
