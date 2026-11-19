import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  livenessResponseSchema,
  problemDetailsSchema,
  readinessResponseSchema,
} from '@heremita/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ENV } from '../src/config/config.module.js';
import { parseEnv } from '../src/config/env.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';
import { UNREACHABLE_DATABASE_URL } from './support/app.js';

async function startApp(databaseUrl: string): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, DATABASE_URL: databaseUrl }))
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

describe('health endpoints with a database', () => {
  let database: TestDatabase;
  let app: NestExpressApplication;

  beforeAll(async () => {
    database = await createTestDatabase();
    app = await startApp(database.url);
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  it('reports liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(livenessResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('reports ready when the database answers', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    expect(readinessResponseSchema.parse(response.body)).toEqual({ status: 'ok', db: 'up' });
  });

  it('answers an unknown route with a 404 problem document', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nowhere');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 404,
      code: 'not_found',
      instance: '/api/v1/nowhere',
    });
  });
});

describe('health endpoints without a database', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await startApp(UNREACHABLE_DATABASE_URL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('still reports liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
  });

  it('reports not ready with a 503 problem document', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'urn:heremita:problem:database_unavailable',
      title: 'Database unavailable',
      status: 503,
      detail: 'The database is not reachable.',
      instance: '/api/v1/health/ready',
      code: 'database_unavailable',
    });
  });
});
