import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ENV } from '../../src/config/config.module.js';
import { parseEnv, type Env } from '../../src/config/env.js';
import { CLOCK } from '../../src/core/clock/clock.js';
import { FixedClock } from '../../src/core/clock/fixed-clock.js';
import {
  GEOCODING_PROVIDER,
  ROUTING_PROVIDER,
  type GeocodingProvider,
  type RoutingProvider,
} from '../../src/providers/core/contract.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestDatabase } from './test-database.js';

/** The web origin every test client claims; unsafe requests from anywhere else get 403 `csrf_rejected`. */
export const WEB_ORIGIN = 'http://localhost:3100';

/** Where the test clock starts unless a test passes its own clock. */
export const TEST_START = '2026-11-18T10:00:00.000Z';

export interface TestAppOptions {
  clock?: FixedClock;
  /** Replaces the env-selected geocoder (the fake one) for this app. */
  geocoding?: GeocodingProvider;
  /** Replaces the env-selected router (the fake one) for this app. */
  routing?: RoutingProvider;
  /** Probe controllers mounted next to the real ones. */
  controllers?: Type[];
}

export interface TestApp {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  clock: FixedClock;
  env: Env;
  /** A client address of its own, so per-IP throttles (sign-up, login) never meet across tests. */
  nextIp(): string;
  /** A fresh e-mail address, unique within this file. */
  nextEmail(): string;
  close(): Promise<void>;
}

/**
 * Boots the whole API (`AppModule` + `configureApp`, the production pipeline)
 * on a private copy of the test database, with plain-HTTP cookies, a
 * `FixedClock` and the fake providers unless the caller passes others.
 */
export async function buildTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const database = await createTestDatabase();
  const clock = options.clock ?? new FixedClock(TEST_START);
  const env = parseEnv({
    ...process.env,
    DATABASE_URL: database.url,
    WEB_ORIGIN,
    COOKIE_SECURE: 'false',
  });

  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(CLOCK)
    .useValue(clock);
  if (options.geocoding) {
    builder = builder.overrideProvider(GEOCODING_PROVIDER).useValue(options.geocoding);
  }
  if (options.routing) {
    builder = builder.overrideProvider(ROUTING_PROVIDER).useValue(options.routing);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  let counter = 0;
  const next = (): number => {
    counter += 1;
    return counter;
  };
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    clock,
    env,
    nextIp: () => {
      const n = next();
      return `10.${Math.floor(n / 62_500) % 250}.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
    },
    nextEmail: () => `user-${next()}@example.com`,
    close: async () => {
      await app.close();
      await database.drop();
    },
  };
}
