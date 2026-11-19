import {
  API_PREFIX,
  ERROR_STATUS,
  PROBLEM_CONTENT_TYPE,
  type EndpointDef,
  type EndpointOutput,
  type EndpointRequest,
  type ErrorCode,
  type Me,
  type ProblemDetails,
} from '@heremita/shared';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import { setupServer, type SetupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** Request id every mocked API response carries, so error states can show it. */
export const TEST_REQUEST_ID = 'req-test-0001';

/**
 * MSW path pattern of an endpoint: `{tripId}` → `:tripId`, any origin (the
 * browser client calls the same-origin `/api/v1` rewrite).
 */
export function endpointPattern(def: Pick<EndpointDef, 'path'>): string {
  return `*${API_PREFIX}${def.path.replace(/\{(\w+)\}/g, ':$1')}`;
}

/** Path parameters of an endpoint, as MSW hands them to a resolver. */
type PathParams<E extends EndpointDef> =
  EndpointRequest<E> extends { params: infer P } ? { [K in keyof P]: string } : never;

/**
 * Mocks one endpoint with a resolver whose request params are typed after the
 * endpoint's `params` schema. Method and path come from the shared definition.
 */
export function onEndpoint<const E extends EndpointDef>(
  def: E,
  resolver: HttpResponseResolver<PathParams<E>>,
) {
  const method = def.method.toLowerCase() as Lowercase<E['method']>;
  return http[method](endpointPattern(def), resolver);
}

/** Success response of an endpoint: its declared status, its typed body (none for 204). */
export function okResponse<const E extends EndpointDef>(
  def: E,
  ...[body]: EndpointOutput<E> extends undefined ? [] : [body: EndpointOutput<E>]
): Response {
  const headers = { 'X-Request-Id': TEST_REQUEST_ID };
  if (def.status === 204) {
    return new HttpResponse(null, { status: 204, headers });
  }
  return HttpResponse.json(body, { status: def.status, headers });
}

/** Extensions a problem document may carry besides the RFC 9457 members. */
type ProblemExtras = Partial<Pick<ProblemDetails, 'errors' | 'currentPlanVersion' | 'tripPlaceId'>>;

/** A problem document as the API sends it: status from the code, `X-Request-Id`, optional headers. */
export function problemResponse(
  code: ErrorCode,
  extras: ProblemExtras = {},
  headers: Record<string, string> = {},
): Response {
  const status = ERROR_STATUS[code];
  const problem: ProblemDetails = {
    type: `urn:heremita:problem:${code}`,
    title: code,
    status,
    detail: `Problem ${code}`,
    instance: API_PREFIX,
    code,
    ...extras,
  };
  return new HttpResponse(JSON.stringify(problem), {
    status,
    headers: {
      'Content-Type': PROBLEM_CONTENT_TYPE,
      'X-Request-Id': TEST_REQUEST_ID,
      ...headers,
    },
  });
}

/** Answers an endpoint with its success body. */
export function respondWith<const E extends EndpointDef>(
  def: E,
  ...body: EndpointOutput<E> extends undefined ? [] : [body: EndpointOutput<E>]
) {
  return onEndpoint(def, () => okResponse(def, ...body));
}

/** Answers an endpoint with a problem document. */
export function failWith(
  def: EndpointDef,
  code: ErrorCode,
  extras?: ProblemExtras,
  headers?: Record<string, string>,
) {
  return onEndpoint(def, () => problemResponse(code, extras, headers));
}

/** Makes an endpoint fail without an HTTP answer (`fetch` rejects with a TypeError). */
export function networkErrorOn(def: EndpointDef) {
  return onEndpoint(def, () => HttpResponse.error());
}

/** A signed-in user as `GET /me` returns it. */
export function buildMe(overrides: Partial<Me> = {}): Me {
  return {
    id: '0195f0c8-0000-7000-8000-000000000001',
    email: 'ana@example.com',
    displayName: 'Ana',
    locale: 'en',
    theme: 'light',
    role: 'user',
    isDemo: false,
    createdAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * An MSW server for one test file, started before its tests and reset after
 * each one. Any request without a handler fails the test (no silent network).
 */
export function setupApiServer(): SetupServer {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}
