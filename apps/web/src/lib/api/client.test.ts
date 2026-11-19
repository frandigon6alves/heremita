import type { Me } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch } from './client';
import { ApiProblemError, HttpError } from './problem';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const me: Me = {
  id: '0195f0c8-0000-7000-8000-000000000001',
  email: 'ana@example.com',
  displayName: 'Ana',
  locale: 'pt-BR',
  theme: 'system',
  role: 'user',
  isDemo: false,
  createdAt: '2026-11-18T10:00:00.000Z',
};

const unauthenticated = {
  type: 'urn:heremita:problem:unauthenticated',
  title: 'Authentication required',
  status: 401,
  detail: 'Log in to continue.',
  instance: '/api/v1/me',
  code: 'unauthenticated',
};

describe('apiFetch', () => {
  it('returns_the_success_body_of_the_endpoint', async () => {
    server.use(http.get('*/api/v1/me', () => HttpResponse.json(me)));

    await expect(apiFetch(apiRoutes.getMe)).resolves.toEqual(me);
  });

  it('fills_path_params_and_query_into_the_api_url', async () => {
    let url = '';
    server.use(
      http.get('*/api/v1/trips/:tripId/days/:dayId/route', ({ request }) => {
        url = request.url;
        return HttpResponse.json({});
      }),
    );

    await apiFetch(apiRoutes.getDayRoute, {
      params: { tripId: 't 1', dayId: 'd1' },
      query: { mode: 'bike' },
    });

    expect(new URL(url).pathname + new URL(url).search).toBe(
      '/api/v1/trips/t%201/days/d1/route?mode=bike',
    );
  });

  it('sends_the_body_as_json_with_the_endpoint_method', async () => {
    let received: { method: string; contentType: string | null; body: unknown } | undefined;
    server.use(
      http.patch('*/api/v1/me', async ({ request }) => {
        received = {
          method: request.method,
          contentType: request.headers.get('content-type'),
          body: await request.json(),
        };
        return HttpResponse.json(me);
      }),
    );

    await apiFetch(apiRoutes.updateMe, { body: { theme: 'dark' } });

    expect(received).toEqual({
      method: 'PATCH',
      contentType: 'application/json',
      body: { theme: 'dark' },
    });
  });

  it('resolves_undefined_on_204', async () => {
    server.use(
      http.delete('*/api/v1/sessions/current', () => new HttpResponse(null, { status: 204 })),
    );

    await expect(apiFetch(apiRoutes.logOut)).resolves.toBeUndefined();
  });

  it('throws_the_problem_with_code_request_id_and_retry_after', async () => {
    server.use(
      http.get('*/api/v1/me', () =>
        HttpResponse.json(
          { ...unauthenticated, status: 429, code: 'rate_limited' },
          { status: 429, headers: { 'X-Request-Id': 'req-12345678', 'Retry-After': '30' } },
        ),
      ),
    );

    const error: unknown = await apiFetch(apiRoutes.getMe).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProblemError);
    expect(error).toMatchObject({
      status: 429,
      code: 'rate_limited',
      requestId: 'req-12345678',
      retryAfterSeconds: 30,
    });
  });

  it('exposes_field_errors_and_conflict_extensions', async () => {
    server.use(
      http.post('*/api/v1/trips/:tripId/places', () =>
        HttpResponse.json(
          {
            ...unauthenticated,
            status: 409,
            code: 'place_already_in_trip',
            tripPlaceId: '0195f0c8-0000-7000-8000-000000000002',
            errors: [{ pointer: '/body/note', detail: 'Too long' }],
          },
          { status: 409 },
        ),
      ),
    );

    const error: unknown = await apiFetch(apiRoutes.addTripPlace, {
      params: { tripId: 't1' },
      body: { place: { type: 'osm', key: 'osm:N:1' } },
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      tripPlaceId: '0195f0c8-0000-7000-8000-000000000002',
      fieldErrors: [{ pointer: '/body/note', detail: 'Too long' }],
      retryAfterSeconds: null,
    });
  });

  it('throws_http_error_when_the_body_is_not_a_problem_document', async () => {
    server.use(http.get('*/api/v1/me', () => new HttpResponse('Bad gateway', { status: 502 })));

    const error: unknown = await apiFetch(apiRoutes.getMe).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 502 });
  });

  it('rejects_with_type_error_when_the_network_fails', async () => {
    server.use(http.get('*/api/v1/me', () => HttpResponse.error()));

    await expect(apiFetch(apiRoutes.getMe)).rejects.toBeInstanceOf(TypeError);
  });
});
