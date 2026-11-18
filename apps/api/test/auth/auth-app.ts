import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Me } from '@heremita/shared';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ENV } from '../../src/config/config.module.js';
import { parseEnv } from '../../src/config/env.js';
import { CLOCK } from '../../src/core/clock/clock.js';
import { FixedClock } from '../../src/core/clock/fixed-clock.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

export const WEB_ORIGIN = 'http://localhost:3100';
export const PASSWORD = 'correct horse battery';

export interface AuthTestApp {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  clock: FixedClock;
  /** A client address of its own, so the per-IP sign-up and login throttles never meet across tests. */
  nextIp(): string;
  /** A fresh e-mail address for this file. */
  nextEmail(): string;
  close(): Promise<void>;
}

/**
 * Boots the whole API (plus any probe `controllers`) on a private database copy
 * with a `FixedClock` and plain-HTTP cookies.
 */
export async function startAuthApp(options: { controllers?: Type[] } = {}): Promise<AuthTestApp> {
  const database: TestDatabase = await createTestDatabase();
  const clock = new FixedClock('2026-11-18T10:00:00.000Z');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(ENV)
    .useValue(
      parseEnv({
        ...process.env,
        DATABASE_URL: database.url,
        WEB_ORIGIN,
        COOKIE_SECURE: 'false',
      }),
    )
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  let counter = 0;
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    clock,
    nextIp: () => {
      counter += 1;
      return `10.0.${Math.floor(counter / 250)}.${(counter % 250) + 1}`;
    },
    nextEmail: () => {
      counter += 1;
      return `user-${counter}@example.com`;
    },
    close: async () => {
      await app.close();
      await database.drop();
    },
  };
}

/** The `Set-Cookie` headers of a response. */
export function setCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  if (header === undefined) {
    return [];
  }
  return Array.isArray(header) ? header : [header];
}

/** `name=value` of the session cookie a response set, ready for a `Cookie` header. */
export function sessionCookieOf(response: request.Response): string {
  const cookie = setCookies(response).find((value) => value.startsWith('hm_session='));
  if (!cookie) {
    throw new Error(`No session cookie in response ${response.status}`);
  }
  return cookie.split(';', 1)[0] ?? '';
}

export interface SignedUp {
  me: Me;
  cookie: string;
  email: string;
}

export async function signUp(t: AuthTestApp, email = t.nextEmail()): Promise<SignedUp> {
  const response = await t.http
    .post('/api/v1/users')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', t.nextIp())
    .send({ email, password: PASSWORD, displayName: 'Ana', locale: 'pt-BR' });
  if (response.status !== 201) {
    throw new Error(`Sign-up failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { me: response.body as Me, cookie: sessionCookieOf(response), email };
}

export function logIn(t: AuthTestApp, email: string, password: string, ip = t.nextIp()) {
  return t.http
    .post('/api/v1/sessions')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', ip)
    .send({ email, password });
}

export function getMe(t: AuthTestApp, cookie?: string) {
  const call = t.http.get('/api/v1/me');
  return cookie ? call.set('Cookie', cookie) : call;
}
