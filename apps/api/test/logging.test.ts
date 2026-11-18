import { Writable } from 'node:stream';
import { Controller } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { endpoint, idSchema } from '@heremita/shared';
import { Logger as JsonLogger, PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ENV } from '../src/config/config.module.js';
import { parseEnv } from '../src/config/env.js';
import { Endpoint } from '../src/core/http/endpoint.decorator.js';
import { loggerParams } from '../src/core/logging/logger-params.js';

// nestjs-pino keeps one root logger per process, so this file (its own Vitest
// module graph) is the only one that captures the log.

const NO_DATABASE_URL = 'postgresql://heremita:heremita@127.0.0.1:1/heremita';
const WEB_ORIGIN = 'http://localhost:3100';
const TRIP_ID = '0193a000-0000-7000-8000-000000000101';

const probe = {
  create: endpoint({
    method: 'POST',
    path: '/probe/{tripId}',
    auth: 'none',
    params: z.strictObject({ tripId: idSchema }),
    query: z.strictObject({ n: z.coerce.number().int() }),
    body: z.strictObject({ name: z.string() }),
    status: 204,
    errors: [],
  }),
  crash: endpoint({
    method: 'GET',
    path: '/probe/crash',
    auth: 'none',
    status: 204,
    errors: [],
  }),
};

@Controller()
class ProbeController {
  @Endpoint(probe.create)
  create(): void {}

  @Endpoint(probe.crash)
  crash(): never {
    throw new Error('unexpected');
  }
}

describe('logging', () => {
  let app: NestExpressApplication;
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const lines = () =>
    chunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  beforeAll(async () => {
    const env = parseEnv({ ...process.env, DATABASE_URL: NO_DATABASE_URL });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(ENV)
      .useValue(env)
      .overrideProvider(PARAMS_PROVIDER_TOKEN)
      .useValue(loggerParams(env, stream))
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    app.useLogger(app.get(JsonLogger));
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs_route_templates_and_never_cookies_bodies_or_query_text', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/probe/${TRIP_ID}?n=1&secretquery=rua-augusta`)
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', 'hm_session=cookie-value-123')
      .set('X-Request-Id', 'pipeline-log-0001')
      .send({ name: 'Senha-secreta-1' });
    await expect.poll(() => chunks.join('')).toContain('pipeline-log-0001');

    const text = chunks.join('');
    expect(text).not.toContain('cookie-value-123');
    expect(text).not.toContain('Senha-secreta-1');
    expect(text).not.toContain('rua-augusta');
    expect(text).not.toContain(TRIP_ID);
    expect(lines()).toContainEqual(
      expect.objectContaining({
        reqId: 'pipeline-log-0001',
        method: 'POST',
        route: '/api/v1/probe/:tripId',
        // The unknown query key makes it a 422: the query string is not logged either way.
        status: 422,
      }),
    );
  });

  it('logs_an_unexpected_error_once_with_the_request_id', async () => {
    chunks.length = 0;

    await request(app.getHttpServer())
      .get('/api/v1/probe/crash')
      .set('X-Request-Id', 'pipeline-log-0002');
    await expect.poll(() => chunks.join('')).toContain('request failed');

    const errors = lines().filter((line) => line.level === 50);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ reqId: 'pipeline-log-0002' });
  });
});
