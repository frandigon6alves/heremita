import { Controller } from '@nestjs/common';
import { endpoint, problemDetailsSchema, type EndpointDef } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { SessionUser } from '../../src/core/http/api-request.js';
import { CurrentUser } from '../../src/core/http/current-user.decorator.js';
import { Endpoint } from '../../src/core/http/endpoint.decorator.js';
import { signUp, startAuthApp, type AuthTestApp } from './auth-app.js';

const whoAmI = z.object({ userId: z.string().nullable(), role: z.string().nullable() });

const probe = {
  optional: endpoint({
    method: 'GET',
    path: '/probe/optional',
    auth: 'optional',
    status: 200,
    response: whoAmI,
    errors: [],
  }),
  moderator: endpoint({
    method: 'GET',
    path: '/probe/moderator',
    auth: 'moderator',
    status: 200,
    response: whoAmI,
    errors: [],
  }),
} satisfies Record<string, EndpointDef>;

function describeCaller(user: SessionUser | null) {
  return { userId: user?.id ?? null, role: user?.role ?? null };
}

@Controller()
class ProbeController {
  @Endpoint(probe.optional)
  optional(@CurrentUser() user: SessionUser | null) {
    return describeCaller(user);
  }

  @Endpoint(probe.moderator)
  moderator(@CurrentUser() user: SessionUser | null) {
    return describeCaller(user);
  }
}

let t: AuthTestApp;

beforeAll(async () => {
  t = await startAuthApp({ controllers: [ProbeController] });
});

afterAll(async () => {
  await t.close();
});

describe('SessionGuard', () => {
  it('reads_the_caller_on_optional_endpoints', async () => {
    const { me, cookie } = await signUp(t);

    const response = await t.http.get('/api/v1/probe/optional').set('Cookie', cookie);

    expect(response.body).toEqual({ userId: me.id, role: 'user' });
  });

  it('treats_a_dead_session_as_anonymous_on_optional_endpoints', async () => {
    const response = await t.http
      .get('/api/v1/probe/optional')
      .set('Cookie', `hm_session=${'B'.repeat(43)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: null, role: null });
  });

  it('answers_401_to_anonymous_callers_of_moderator_endpoints', async () => {
    const response = await t.http.get('/api/v1/probe/moderator');

    expect(response.status).toBe(401);
    expect(problemDetailsSchema.parse(response.body).code).toBe('unauthenticated');
  });

  it('answers_403_to_signed_in_non_moderators', async () => {
    const { cookie } = await signUp(t);

    const response = await t.http.get('/api/v1/probe/moderator').set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(problemDetailsSchema.parse(response.body).code).toBe('forbidden');
  });

  it('lets_moderators_in', async () => {
    const { me, cookie } = await signUp(t);
    await t.prisma.user.update({ where: { id: me.id }, data: { role: 'moderator' } });

    const response = await t.http.get('/api/v1/probe/moderator').set('Cookie', cookie);

    expect(response.body).toEqual({ userId: me.id, role: 'moderator' });
  });
});
