import {
  problemDetailsSchema,
  type ErrorCode,
  type ProblemDetails,
  type UserCard,
} from '@heremita/shared';
import request from 'supertest';
import { expect } from 'vitest';
import { WEB_ORIGIN, type TestApp } from './app.js';
import type { TestAgent, TestUser } from './factories.js';

/** An id no row has. */
export const UNKNOWN_ID = '0190d3a4-0000-7000-8000-000000000000';

export const MINUTE_MS = 60_000;

/** Moves the test clock one minute on and returns the new time, so rows written in turn sort by creation. */
export function nextMinute(t: TestApp): Date {
  t.clock.advance(MINUTE_MS);
  return t.clock.now();
}

/** A client without a session that passes the CSRF check, so a missing session answers 401. */
export function anonymous(t: TestApp): TestAgent {
  return request
    .agent(t.app.getHttpServer())
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', t.nextIp());
}

export function problemOf(response: { body: unknown }): ProblemDetails {
  return problemDetailsSchema.parse(response.body);
}

/** Asserts an error answer: status, problem body and code. */
export function expectProblem(
  response: request.Response,
  status: number,
  code: ErrorCode,
): ProblemDetails {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  const problem = problemOf(response);
  expect(problem.code).toBe(code);
  return problem;
}

/** Every object key anywhere in `value`, to prove a payload never carries a field. */
export function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysOf);
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
  }
  return [];
}

export function cardOf({ user }: TestUser): UserCard {
  return { id: user.id, displayName: user.displayName, isDemo: user.isDemo };
}
