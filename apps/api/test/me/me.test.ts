import { endpoints, problemDetailsSchema, type EndpointDef, type Me } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD_HASH_PREFIX } from '../../src/core/password/passwords.js';
import { getMe, logIn, sessionCookieOf, setCookies } from '../auth/auth-app.js';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';
import { createUser, FACTORY_PASSWORD } from '../support/factories.js';
import { sendRaw, type RawRequest } from '../support/http.js';

const NEW_PASSWORD = 'a much longer passphrase';

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

function problemOf(response: { body: unknown }) {
  return problemDetailsSchema.parse(response.body);
}

function sendAnonymous(def: EndpointDef, raw: RawRequest) {
  return sendRaw(t.http, def, raw).set('Origin', WEB_ORIGIN);
}

describe('E9 updateMe', () => {
  it('updates_display_name_locale_and_theme', async () => {
    const { agent, user } = await createUser(t);

    const response = await sendRaw(agent, endpoints.updateMe, {
      body: { displayName: '  Bea  ', locale: 'en', theme: 'dark' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...user,
      displayName: 'Bea',
      locale: 'en',
      theme: 'dark',
    } satisfies Me);
    expect((await sendRaw(agent, endpoints.getMe)).body).toEqual(response.body);
  });

  it('changes_only_the_fields_sent', async () => {
    const { agent, user } = await createUser(t);

    const response = await sendRaw(agent, endpoints.updateMe, { body: { theme: 'light' } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...user, theme: 'light' });
  });

  it('rejects_an_empty_body', async () => {
    const { agent } = await createUser(t);

    const response = await sendRaw(agent, endpoints.updateMe, { body: {} });

    expect(response.status).toBe(422);
    expect(problemOf(response).code).toBe('validation_failed');
  });

  it('rejects_a_display_name_over_50_characters_with_its_pointer', async () => {
    const { agent, user } = await createUser(t);

    const response = await sendRaw(agent, endpoints.updateMe, {
      body: { displayName: 'x'.repeat(51) },
    });

    expect(response.status).toBe(422);
    expect(problemOf(response).errors?.map((error) => error.pointer)).toEqual([
      '/body/displayName',
    ]);
    expect((await sendRaw(agent, endpoints.getMe)).body).toEqual(user);
  });

  it('rejects_fields_outside_the_allowlist', async () => {
    const { agent } = await createUser(t);

    const response = await sendRaw(agent, endpoints.updateMe, { body: { role: 'moderator' } });

    expect(response.status).toBe(422);
    expect(problemOf(response).code).toBe('validation_failed');
  });

  it('needs_a_session', async () => {
    const response = await sendAnonymous(endpoints.updateMe, { body: { theme: 'dark' } });

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('unauthenticated');
  });
});

describe('E10 changePassword (V32, V34)', () => {
  it('rotates_the_current_session_and_kills_the_others', async () => {
    const { agent, cookie, user, email } = await createUser(t);
    const other = sessionCookieOf(await logIn(t, email, FACTORY_PASSWORD));

    const response = await sendRaw(agent, endpoints.changePassword, {
      body: { currentPassword: FACTORY_PASSWORD, newPassword: NEW_PASSWORD },
    });

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    const rotated = sessionCookieOf(response);
    expect(rotated).not.toBe(cookie);
    expect(setCookies(response)[0]).toMatch(/; Path=\/; HttpOnly; SameSite=Lax$/);
    expect((await getMe(t, cookie)).status).toBe(401);
    expect((await getMe(t, other)).status).toBe(401);
    expect((await getMe(t, rotated)).body).toEqual(user);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('stores_the_new_password_as_argon2id', async () => {
    const { agent, user, email } = await createUser(t);
    t.clock.advance(60_000);

    await sendRaw(agent, endpoints.changePassword, {
      body: { currentPassword: FACTORY_PASSWORD, newPassword: NEW_PASSWORD },
    });

    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash.startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
    expect(row.passwordChangedAt).toEqual(t.clock.now());
    expect((await logIn(t, email, NEW_PASSWORD)).status).toBe(201);
    expect((await logIn(t, email, FACTORY_PASSWORD)).status).toBe(401);
  });

  it('answers_wrong_password_at_current_password_and_changes_nothing', async () => {
    const { agent, cookie, user } = await createUser(t);
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const response = await sendRaw(agent, endpoints.changePassword, {
      body: { currentPassword: 'not my password', newPassword: NEW_PASSWORD },
    });

    expect(response.status).toBe(422);
    const problem = problemOf(response);
    expect(problem.code).toBe('wrong_password');
    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/body/currentPassword']);
    expect(setCookies(response)).toEqual([]);
    expect(await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
    expect((await getMe(t, cookie)).status).toBe(200);
  });

  it.each([
    ['too_short', 'short pass'],
    ['common', 'Unbelievable'],
  ])('rejects_a_new_password_that_is_%s', async (_case, newPassword) => {
    const { agent } = await createUser(t);

    const response = await sendRaw(agent, endpoints.changePassword, {
      body: { currentPassword: FACTORY_PASSWORD, newPassword },
    });

    expect(response.status).toBe(422);
    expect(problemOf(response).errors?.map((error) => error.pointer)).toEqual([
      '/body/newPassword',
    ]);
  });

  it('rejects_the_local_part_of_the_email_address', async () => {
    const { agent } = await createUser(t, { email: 'traveller.local.part@example.com' });

    const response = await sendRaw(agent, endpoints.changePassword, {
      body: { currentPassword: FACTORY_PASSWORD, newPassword: 'Traveller.Local.Part' },
    });

    expect(response.status).toBe(422);
    expect(problemOf(response).errors?.map((error) => error.pointer)).toEqual([
      '/body/newPassword',
    ]);
  });

  it('rejects_the_email_address_itself', async () => {
    const { agent, email } = await createUser(t);

    const response = await sendRaw(agent, endpoints.changePassword, {
      body: { currentPassword: FACTORY_PASSWORD, newPassword: email },
    });

    expect(response.status).toBe(422);
    expect(problemOf(response).errors?.map((error) => error.pointer)).toEqual([
      '/body/newPassword',
    ]);
  });

  it('needs_a_session', async () => {
    const response = await sendAnonymous(endpoints.changePassword, {
      body: { currentPassword: FACTORY_PASSWORD, newPassword: NEW_PASSWORD },
    });

    expect(response.status).toBe(401);
  });
});

describe('E11 deleteAccount', () => {
  it('deletes_the_user_and_clears_the_cookie', async () => {
    const { agent, cookie, user, email } = await createUser(t);

    const response = await sendRaw(agent, endpoints.deleteAccount, {
      body: { password: FACTORY_PASSWORD },
    });

    expect(response.status).toBe(204);
    expect(setCookies(response)).toEqual([
      'hm_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    ]);
    expect(await t.prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect((await getMe(t, cookie)).status).toBe(401);
    expect((await logIn(t, email, FACTORY_PASSWORD)).status).toBe(401);
  });

  it('answers_wrong_password_and_keeps_the_account', async () => {
    const { agent, cookie, user } = await createUser(t);

    const response = await sendRaw(agent, endpoints.deleteAccount, {
      body: { password: 'not my password' },
    });

    expect(response.status).toBe(422);
    const problem = problemOf(response);
    expect(problem.code).toBe('wrong_password');
    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/body/password']);
    expect(await t.prisma.user.count({ where: { id: user.id } })).toBe(1);
    expect((await getMe(t, cookie)).status).toBe(200);
  });

  it('rejects_a_missing_password_with_its_pointer', async () => {
    const { agent } = await createUser(t);

    const response = await sendRaw(agent, endpoints.deleteAccount, { body: {} });

    expect(response.status).toBe(422);
    expect(problemOf(response).errors?.map((error) => error.pointer)).toEqual(['/body/password']);
  });

  it('needs_a_session', async () => {
    const response = await sendAnonymous(endpoints.deleteAccount, {
      body: { password: FACTORY_PASSWORD },
    });

    expect(response.status).toBe(401);
  });
});
