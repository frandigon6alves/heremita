import { Body, Controller } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  endpoint,
  endpoints,
  idSchema,
  problemDetailsSchema,
  type EndpointDef,
} from '@heremita/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ENV } from '../src/config/config.module.js';
import { parseEnv } from '../src/config/env.js';
import type { ContractInput } from '../src/core/http/api-request.js';
import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  CLIENT_IP_SIGNATURE_MAX_AGE_MS,
  signClientIp,
} from '../src/core/http/client-address.js';
import { Endpoint } from '../src/core/http/endpoint.decorator.js';
import { Input } from '../src/core/http/input.decorator.js';
import { UNREACHABLE_DATABASE_URL, WEB_ORIGIN } from './support/app.js';

const TRIP_ID = '0193a000-0000-7000-8000-000000000101';

const echoBody = z.strictObject({ name: z.string().min(1), tags: z.array(z.string()).optional() });
const echoResponse = z.object({ name: z.string(), tripId: idSchema });

const probe = {
  create: endpoint({
    method: 'POST',
    path: '/probe/{tripId}',
    auth: 'none',
    params: z.strictObject({ tripId: idSchema }),
    query: z.strictObject({ n: z.coerce.number().int().max(5).default(1) }),
    body: echoBody,
    status: 201,
    response: echoResponse,
    errors: [],
  }),
  remove: endpoint({
    method: 'DELETE',
    path: '/probe/{tripId}',
    auth: 'none',
    params: z.strictObject({ tripId: idSchema }),
    status: 204,
    errors: [],
  }),
  broken: endpoint({
    method: 'GET',
    path: '/probe/broken',
    auth: 'none',
    status: 200,
    response: echoResponse,
    errors: [],
  }),
  crash: endpoint({
    method: 'GET',
    path: '/probe/crash',
    auth: 'none',
    status: 200,
    response: echoResponse,
    errors: [],
  }),
  limited: endpoint({
    method: 'GET',
    path: '/probe/limited',
    auth: 'none',
    throttle: 'route',
    status: 204,
    errors: [],
  }),
} satisfies Record<string, EndpointDef>;

@Controller()
class ProbeController {
  @Endpoint(probe.create)
  create(@Input() input: ContractInput, @Body() raw: unknown) {
    const { params, body } = input as { params: { tripId: string }; body: { name: string } };
    return { name: body.name, tripId: params.tripId, extra: 'stripped', raw };
  }

  @Endpoint(probe.remove)
  remove(): string {
    return 'ignored';
  }

  @Endpoint(probe.broken)
  broken() {
    return { name: 'x', tripId: 'not-a-uuid' };
  }

  @Endpoint(probe.crash)
  crash(): never {
    throw new Error('connection string postgresql://user:pw@db leaked?');
  }

  @Endpoint(probe.limited)
  limited(): void {}
}

async function startApp(overrides: Record<string, string> = {}): Promise<NestExpressApplication> {
  const env = parseEnv({ ...process.env, DATABASE_URL: UNREACHABLE_DATABASE_URL, ...overrides });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController],
  })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

function post(app: NestExpressApplication, path: string) {
  return request(app.getHttpServer()).post(path).set('Origin', WEB_ORIGIN);
}

function expectProblem(body: unknown, code: string) {
  const problem = problemDetailsSchema.parse(body);
  expect(problem).toMatchObject({ code, type: `urn:heremita:problem:${code}` });
  return problem;
}

describe('http pipeline', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await startApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates_with_201_and_returns_only_the_contract_fields', async () => {
    const response = await post(app, `/api/v1/probe/${TRIP_ID}?n=2`).send({ name: 'Lisboa' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ name: 'Lisboa', tripId: TRIP_ID });
  });

  it('answers_204_with_no_body', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/probe/${TRIP_ID}`)
      .set('Origin', WEB_ORIGIN);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('rejects_unknown_and_invalid_fields_with_pointers', async () => {
    const response = await post(app, `/api/v1/probe/${TRIP_ID}?n=9`).send({
      name: '',
      ownerId: TRIP_ID,
    });

    expect(response.status).toBe(422);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    const problem = expectProblem(response.body, 'validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toEqual([
      '/query/n',
      '/body/name',
      '/body/ownerId',
    ]);
    expect(problem.instance).toBe(`/api/v1/probe/${TRIP_ID}`);
  });

  it('answers_404_for_a_malformed_path_id', async () => {
    const response = await post(app, '/api/v1/probe/not-a-uuid').send({ name: 'x' });

    expect(response.status).toBe(404);
    expectProblem(response.body, 'trip_not_found');
  });

  it('answers_400_for_malformed_json', async () => {
    const response = await post(app, `/api/v1/probe/${TRIP_ID}`)
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(response.status).toBe(400);
    expectProblem(response.body, 'malformed_request');
  });

  it('answers_413_for_a_body_over_64_kb', async () => {
    const response = await post(app, `/api/v1/probe/${TRIP_ID}`).send({
      name: 'x'.repeat(66_000),
    });

    expect(response.status).toBe(413);
    expectProblem(response.body, 'payload_too_large');
  });

  it('answers_415_for_a_non_json_body', async () => {
    const response = await post(app, `/api/v1/probe/${TRIP_ID}`)
      .set('Content-Type', 'text/plain')
      .send('name=x');

    expect(response.status).toBe(415);
    expectProblem(response.body, 'unsupported_media_type');
  });

  it('rejects_cross_site_unsafe_requests', async () => {
    const server = app.getHttpServer();
    const noOrigin = await request(server).post(`/api/v1/probe/${TRIP_ID}`).send({ name: 'x' });
    const otherOrigin = await request(server)
      .post(`/api/v1/probe/${TRIP_ID}`)
      .set('Origin', 'http://localhost:3101')
      .send({ name: 'x' });
    const sameSite = await post(app, `/api/v1/probe/${TRIP_ID}`)
      .set('Sec-Fetch-Site', 'same-site')
      .send({ name: 'x' });

    for (const response of [noOrigin, otherOrigin, sameSite]) {
      expect(response.status).toBe(403);
      expectProblem(response.body, 'csrf_rejected');
    }
  });

  it('accepts_same_origin_fetch_metadata_without_origin', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/probe/${TRIP_ID}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ name: 'x' });

    expect(response.status).toBe(201);
  });

  it('answers_500_without_details_when_a_response_breaks_its_contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/probe/broken');

    expect(response.status).toBe(500);
    const problem = expectProblem(response.body, 'internal_error');
    expect(problem.detail).toBe('An unexpected error occurred.');
    expect(JSON.stringify(response.body)).not.toContain('not-a-uuid');
  });

  it('answers_500_without_internals_for_an_unexpected_error', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/probe/crash');

    expect(response.status).toBe(500);
    expectProblem(response.body, 'internal_error');
    expect(response.text).not.toContain('postgresql');
  });

  it('sets_security_and_cache_headers_on_every_response', async () => {
    const ok = await request(app.getHttpServer()).get('/api/v1/health');
    const missing = await request(app.getHttpServer()).get('/api/v1/nowhere?q=x');

    for (const response of [ok, missing]) {
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(expectProblem(missing.body, 'not_found').instance).toBe('/api/v1/nowhere');
  });

  it('echoes_a_well_formed_request_id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'web-req-12345678');

    expect(response.headers['x-request-id']).toBe('web-req-12345678');
  });

  it('serves_the_generated_openapi_document', async () => {
    const { default: document } = (await import('@heremita/shared/openapi.json', {
      with: { type: 'json' },
    })) as { default: unknown };

    const response = await request(app.getHttpServer()).get('/api/v1/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(document);
  });

  it('declares_every_answered_code_for_health_readiness', () => {
    expect(endpoints.getReadiness.errors).toContain('database_unavailable');
  });
});

describe('throttling', () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function hit(target: NestExpressApplication, forwardedFor: string) {
    return request(target.getHttpServer())
      .get('/api/v1/probe/limited')
      .set('X-Forwarded-For', forwardedFor);
  }

  it('answers_429_with_retry_after_over_the_endpoint_limit', async () => {
    app = await startApp({ TRUST_PROXY: '10.255.255.1' });

    const statuses: number[] = [];
    let last = await hit(app, '203.0.113.1');
    statuses.push(last.status);
    for (let index = 1; index < 6; index += 1) {
      // A client-chosen X-Forwarded-For from an untrusted hop does not open new buckets.
      last = await hit(app, `203.0.113.${index + 1}`);
      statuses.push(last.status);
    }

    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
    expectProblem(last.body, 'rate_limited');
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keys_anonymous_callers_by_the_address_the_trusted_proxy_reports', async () => {
    app = await startApp({ TRUST_PROXY: 'loopback' });

    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      statuses.push((await hit(app, `198.51.100.${index}`)).status);
    }

    expect(statuses).toEqual([204, 204, 204, 204, 204, 204]);
  });
});

describe('client address signed by the web server (V36)', () => {
  const SECRET = 'pipeline-test-secret-0123456789abcdef';
  /** The one address every server render reaches the API from (e.g. Vercel's egress). */
  const WEB_SERVER_IP = '192.0.2.10';
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  function render(target: NestExpressApplication, headers: Record<string, string> = {}) {
    return request(target.getHttpServer())
      .get('/api/v1/probe/limited')
      .set({ 'X-Forwarded-For': WEB_SERVER_IP, ...headers });
  }

  function signed(ip: string, { secret = SECRET, at = Date.now() } = {}) {
    return { [CLIENT_IP_HEADER]: ip, [CLIENT_IP_SIGNATURE_HEADER]: signClientIp(secret, ip, at) };
  }

  async function statusesOf(calls: (() => Promise<{ status: number }>)[]): Promise<number[]> {
    const statuses: number[] = [];
    for (const call of calls) {
      statuses.push((await call()).status);
    }
    return statuses;
  }

  it('gives_each_signed_client_address_its_own_bucket_behind_one_server_address', async () => {
    app = await startApp({ TRUST_PROXY: 'loopback', SERVER_FETCH_SECRET: SECRET });
    const target = app;

    const first = await statusesOf(
      Array.from({ length: 6 }, () => () => render(target, signed('203.0.113.7'))),
    );
    const second = await render(target, signed('198.51.100.23'));
    const unsigned = await render(target);

    expect(first).toEqual([204, 204, 204, 204, 204, 429]);
    expect(second.status).toBe(204);
    expect(unsigned.status).toBe(204);
  });

  it('keys_missing_forged_or_expired_signatures_by_the_request_address', async () => {
    app = await startApp({ TRUST_PROXY: 'loopback', SERVER_FETCH_SECRET: SECRET });
    const target = app;
    const valid = signed('203.0.113.8');

    const statuses = await statusesOf([
      () => render(target),
      () => render(target, { [CLIENT_IP_HEADER]: '203.0.113.9' }),
      () => render(target, signed('203.0.113.10', { secret: `${SECRET}-forged` })),
      () =>
        render(
          target,
          signed('203.0.113.11', { at: Date.now() - CLIENT_IP_SIGNATURE_MAX_AGE_MS - 1_000 }),
        ),
      () => render(target, { ...valid, [CLIENT_IP_HEADER]: '203.0.113.12' }),
      () => render(target, signed('not-an-address')),
    ]);
    const stillValid = await render(target, valid);

    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
    expect(stillValid.status).toBe(204);
  });

  it('never_trusts_the_header_without_a_configured_secret', async () => {
    app = await startApp({ TRUST_PROXY: 'loopback', SERVER_FETCH_SECRET: '' });
    const target = app;

    const statuses = await statusesOf(
      Array.from({ length: 6 }, (_, index) => () => render(target, signed(`203.0.113.${index}`))),
    );

    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
  });
});
