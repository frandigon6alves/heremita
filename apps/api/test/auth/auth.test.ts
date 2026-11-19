import { createHash } from 'node:crypto';
import { meSchema, problemDetailsSchema } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD_HASH_PREFIX } from '../../src/core/password/passwords.js';
import {
  getMe,
  logIn,
  PASSWORD,
  sessionCookieOf,
  setCookies,
  signUp,
  startAuthApp,
  WEB_ORIGIN,
  type AuthTestApp,
} from './auth-app.js';

let t: AuthTestApp;

beforeAll(async () => {
  t = await startAuthApp();
});

afterAll(async () => {
  await t.close();
});

function postSignUp(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return t.http
    .post('/api/v1/users')
    .set({ Origin: WEB_ORIGIN, 'X-Forwarded-For': t.nextIp(), ...headers })
    .send(body);
}

function signUpBody(overrides: Record<string, unknown> = {}) {
  return {
    email: t.nextEmail(),
    password: PASSWORD,
    displayName: 'Ana Souza',
    locale: 'en',
    ...overrides,
  };
}

describe('E4 sign-up', () => {
  it('creates_the_account_and_signs_in', async () => {
    const body = signUpBody({ email: '  New.Person@Example.COM ' });

    const response = await postSignUp(body);

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/api/v1/me');
    const me = meSchema.parse(response.body);
    expect(me).toMatchObject({
      email: 'new.person@example.com',
      displayName: 'Ana Souza',
      locale: 'en',
      theme: 'system',
      role: 'user',
      isDemo: false,
    });
    const profile = await getMe(t, sessionCookieOf(response));
    expect(profile.status).toBe(200);
    expect(profile.body).toEqual(response.body);
  });

  it('stores_an_argon2id_hash_with_the_owasp_parameters', async () => {
    const body = signUpBody();

    await postSignUp(body);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    expect(user.passwordHash.startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects_a_taken_email_whatever_its_case', async () => {
    const { email } = await signUp(t);

    const response = await postSignUp(signUpBody({ email: email.toUpperCase() }));

    expect(response.status).toBe(409);
    expect(problemDetailsSchema.parse(response.body).code).toBe('email_taken');
    expect(setCookies(response)).toEqual([]);
  });

  it.each([
    ['a_common_password', { password: 'Unbelievable' }],
    ['a_short_password', { password: 'elevenchars' }],
    ['a_long_password', { password: 'x'.repeat(129) }],
    [
      'the_email_as_password',
      { email: 'maria.silva@example.com', password: 'Maria.Silva@example.com' },
    ],
    ['the_local_part_as_password', { email: 'maria.silva2@example.com', password: 'maria.silva2' }],
  ])('rejects_%s_at_the_password_pointer', async (_name, overrides) => {
    const response = await postSignUp(signUpBody(overrides));

    expect(response.status).toBe(422);
    const problem = problemDetailsSchema.parse(response.body);
    expect(problem.code).toBe('validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/body/password']);
  });

  it('accepts_the_boundary_lengths_of_a_password', async () => {
    const shortest = await postSignUp(signUpBody({ password: 'twelve chars' }));
    const longest = await postSignUp(signUpBody({ password: 'y'.repeat(128) }));

    expect([shortest.status, longest.status]).toEqual([201, 201]);
  });

  it('rejects_unknown_fields', async () => {
    const response = await postSignUp(signUpBody({ role: 'moderator' }));

    expect(response.status).toBe(422);
    expect(problemDetailsSchema.parse(response.body).errors).toEqual([
      expect.objectContaining({ pointer: '/body/role' }),
    ]);
  });

  it('limits_sign_ups_per_client_address', async () => {
    const ip = t.nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await postSignUp(signUpBody(), { 'X-Forwarded-For': ip });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe('CSRF on sign-up and login (V30)', () => {
  const paths = ['/api/v1/users', '/api/v1/sessions'];

  it.each(paths)('rejects_a_cross_site_fetch_to_%s', async (path) => {
    const response = await t.http
      .post(path)
      .set({ 'Sec-Fetch-Site': 'cross-site', Origin: WEB_ORIGIN, 'X-Forwarded-For': t.nextIp() })
      .send(signUpBody());

    expect(response.status).toBe(403);
    expect(problemDetailsSchema.parse(response.body).code).toBe('csrf_rejected');
  });

  it.each(paths)('rejects_a_same_site_fetch_to_%s', async (path) => {
    const response = await t.http
      .post(path)
      .set({ 'Sec-Fetch-Site': 'same-site', 'X-Forwarded-For': t.nextIp() })
      .send(signUpBody());

    expect(response.status).toBe(403);
  });

  it.each(paths)('rejects_%s_without_fetch_metadata_or_origin', async (path) => {
    const response = await t.http.post(path).set('X-Forwarded-For', t.nextIp()).send(signUpBody());

    expect(response.status).toBe(403);
  });

  it.each(paths)('rejects_%s_from_another_origin', async (path) => {
    const response = await t.http
      .post(path)
      .set({ Origin: 'http://localhost:3110', 'X-Forwarded-For': t.nextIp() })
      .send(signUpBody());

    expect(response.status).toBe(403);
  });

  it('accepts_a_same_origin_fetch', async () => {
    const response = await t.http
      .post('/api/v1/users')
      .set({ 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': t.nextIp() })
      .send(signUpBody());

    expect(response.status).toBe(201);
  });
});

describe('E5 login', () => {
  it('signs_in_with_the_right_password', async () => {
    const { email, me } = await signUp(t);

    const response = await logIn(t, `  ${email.toUpperCase()}`, PASSWORD);

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/api/v1/sessions/current');
    expect(response.body).toEqual(me);
    expect((await getMe(t, sessionCookieOf(response))).status).toBe(200);
  });

  it('opens_a_new_session_on_every_login', async () => {
    const { email, me } = await signUp(t);

    const first = sessionCookieOf(await logIn(t, email, PASSWORD));
    const second = sessionCookieOf(await logIn(t, email, PASSWORD));

    expect(first).not.toBe(second);
    expect(await t.prisma.session.count({ where: { userId: me.id } })).toBe(3);
  });

  it('answers_unknown_email_and_wrong_password_identically', async () => {
    const { email } = await signUp(t);

    const wrongPassword = await logIn(t, email, 'not the password');
    const unknownEmail = await logIn(t, 'nobody-here@example.com', 'not the password');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(problemDetailsSchema.parse(wrongPassword.body).code).toBe('invalid_credentials');
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(setCookies(wrongPassword)).toEqual([]);
  });

  it('rejects_a_blank_password_as_invalid_input', async () => {
    const response = await logIn(t, 'someone@example.com', '');

    expect(response.status).toBe(422);
    expect(problemDetailsSchema.parse(response.body).errors?.[0]?.pointer).toBe('/body/password');
  });
});

describe('login attempts (V33)', () => {
  it('answers_429_with_retry_after_on_the_sixth_failure_in_15_minutes', async () => {
    const { email } = await signUp(t);
    for (let i = 0; i < 5; i += 1) {
      expect((await logIn(t, email, 'wrong password!')).status).toBe(401);
      t.clock.advance(60_000);
    }

    const sixth = await logIn(t, email, 'wrong password!');

    expect(sixth.status).toBe(429);
    expect(problemDetailsSchema.parse(sixth.body).code).toBe('too_many_attempts');
    expect(sixth.headers['retry-after']).toBe(String(15 * 60 - 5 * 60));
  });

  it('counts_failures_for_unknown_emails_too', async () => {
    const email = t.nextEmail();
    for (let i = 0; i < 5; i += 1) {
      await logIn(t, email, 'wrong password!');
    }

    const sixth = await logIn(t, email, 'wrong password!');

    expect(sixth.status).toBe(429);
  });

  it('lets_the_right_password_in_once_the_window_ends', async () => {
    const { email } = await signUp(t);
    for (let i = 0; i < 5; i += 1) {
      await logIn(t, email, 'wrong password!');
    }
    expect((await logIn(t, email, PASSWORD)).status).toBe(429);

    t.clock.advance(15 * 60 * 1000);

    expect((await logIn(t, email, PASSWORD)).status).toBe(201);
  });

  it('forgets_failures_after_a_successful_login', async () => {
    const { email } = await signUp(t);
    for (let i = 0; i < 4; i += 1) {
      await logIn(t, email, 'wrong password!');
    }
    await logIn(t, email, PASSWORD);
    for (let i = 0; i < 5; i += 1) {
      await logIn(t, email, 'wrong password!');
    }

    expect((await logIn(t, email, 'wrong password!')).status).toBe(429);
    expect((await logIn(t, 'someone-else@example.com', 'wrong password!')).status).toBe(401);
  });

  it('checks_at_most_five_passwords_when_guesses_arrive_at_once', async () => {
    const { email } = await signUp(t);

    const answers = await Promise.all(
      Array.from({ length: 12 }, () => logIn(t, email, 'wrong password!')),
    );

    const statuses = answers.map((answer) => answer.status);
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(7);
  });
});

describe('E8 me', () => {
  it('needs_a_session', async () => {
    const response = await getMe(t);

    expect(response.status).toBe(401);
    expect(problemDetailsSchema.parse(response.body).code).toBe('unauthenticated');
  });

  it('rejects_an_unknown_token', async () => {
    const response = await getMe(t, `hm_session=${'A'.repeat(43)}`);

    expect(response.status).toBe(401);
  });

  it('ignores_the_secure_cookie_name_when_cookies_are_not_secure', async () => {
    const { cookie } = await signUp(t);

    const response = await getMe(t, cookie.replace('hm_session=', '__Host-hm_session='));

    expect(response.status).toBe(401);
  });

  it('is_never_cached', async () => {
    const { cookie } = await signUp(t);

    const response = await getMe(t, cookie);

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('session cookie and storage (V31)', () => {
  it('sets_a_lax_http_only_cookie_living_until_the_absolute_expiry', async () => {
    const response = await postSignUp(signUpBody());

    const cookies = setCookies(response);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      /^hm_session=[A-Za-z0-9_-]{43}; Max-Age=7776000; Path=\/; HttpOnly; SameSite=Lax$/,
    );
  });

  it('stores_only_the_sha256_of_a_32_byte_token', async () => {
    const response = await postSignUp(signUpBody());
    const token = sessionCookieOf(response).slice('hm_session='.length);
    const userId = (response.body as { id: string }).id;

    const session = await t.prisma.session.findFirstOrThrow({ where: { userId } });

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(Buffer.from(session.tokenHash).equals(createHash('sha256').update(token).digest())).toBe(
      true,
    );
  });
});
