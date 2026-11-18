import { problemDetailsSchema } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionCookies } from '../../src/auth/session-cookies.js';
import { SessionService } from '../../src/auth/session.service.js';
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

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

let t: AuthTestApp;

beforeAll(async () => {
  t = await startAuthApp();
});

afterAll(async () => {
  await t.close();
});

function sessionsOf(userId: string) {
  return t.prisma.session.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

function remove(path: string, cookie: string) {
  return t.http.delete(path).set({ Origin: WEB_ORIGIN, Cookie: cookie });
}

describe('session lifetime (V31)', () => {
  it('does_not_write_when_used_again_within_the_hour', async () => {
    const { me, cookie } = await signUp(t);
    const [before] = await sessionsOf(me.id);

    t.clock.advance(30 * MINUTE_MS);
    const response = await getMe(t, cookie);

    expect(response.status).toBe(200);
    const [after] = await sessionsOf(me.id);
    expect(after).toEqual(before);
  });

  it('slides_the_idle_expiry_when_used_after_an_hour', async () => {
    const { me, cookie } = await signUp(t);
    const [before] = await sessionsOf(me.id);

    t.clock.advance(2 * HOUR_MS);
    const now = t.clock.now();
    const response = await getMe(t, cookie);

    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
    const [after] = await sessionsOf(me.id);
    expect(after?.lastUsedAt).toEqual(now);
    expect(after?.expiresAt).toEqual(new Date(now.getTime() + 30 * DAY_MS));
    expect(after?.absoluteExpiresAt).toEqual(before?.absoluteExpiresAt);
  });

  it('dies_after_30_idle_days', async () => {
    const { cookie } = await signUp(t);

    t.clock.advance(30 * DAY_MS - 1);
    expect((await getMe(t, cookie)).status).toBe(200);
    t.clock.advance(30 * DAY_MS);
    const response = await getMe(t, cookie);

    expect(response.status).toBe(401);
    expect(problemDetailsSchema.parse(response.body).code).toBe('unauthenticated');
  });

  it('dies_after_90_days_even_when_used_every_day', async () => {
    const { me, cookie } = await signUp(t);
    const [session] = await sessionsOf(me.id);
    const absolute = session?.absoluteExpiresAt.getTime() ?? 0;

    while (t.clock.now().getTime() + DAY_MS < absolute) {
      t.clock.advance(DAY_MS);
      expect((await getMe(t, cookie)).status).toBe(200);
    }
    const [lastTouched] = await sessionsOf(me.id);
    t.clock.set(new Date(absolute));

    expect(lastTouched?.expiresAt.getTime()).toBe(absolute);
    expect((await getMe(t, cookie)).status).toBe(401);
  });
});

describe('E6 logout (V34)', () => {
  it('kills_the_session_and_clears_the_cookie', async () => {
    const { cookie } = await signUp(t);

    const response = await remove('/api/v1/sessions/current', cookie);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(setCookies(response)).toEqual([
      'hm_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    ]);
    expect((await getMe(t, cookie)).status).toBe(401);
  });

  it('keeps_the_other_sessions_of_the_user', async () => {
    const { email, cookie } = await signUp(t);
    const other = sessionCookieOf(await logIn(t, email, PASSWORD));

    await remove('/api/v1/sessions/current', cookie);

    expect((await getMe(t, other)).status).toBe(200);
  });

  it('needs_a_session', async () => {
    const { cookie } = await signUp(t);
    await remove('/api/v1/sessions/current', cookie);

    const again = await remove('/api/v1/sessions/current', cookie);

    expect(again.status).toBe(401);
  });

  it('refuses_a_cross_site_logout', async () => {
    const { cookie } = await signUp(t);

    const response = await t.http
      .delete('/api/v1/sessions/current')
      .set({ 'Sec-Fetch-Site': 'cross-site', Cookie: cookie });

    expect(response.status).toBe(403);
    expect((await getMe(t, cookie)).status).toBe(200);
  });
});

describe('E7 logout everywhere (V34)', () => {
  it('kills_every_session_of_the_user_only', async () => {
    const { email, me, cookie } = await signUp(t);
    const other = sessionCookieOf(await logIn(t, email, PASSWORD));
    const stranger = await signUp(t);

    const response = await remove('/api/v1/sessions', other);

    expect(response.status).toBe(204);
    expect(setCookies(response)).toEqual([
      'hm_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    ]);
    expect((await getMe(t, cookie)).status).toBe(401);
    expect((await getMe(t, other)).status).toBe(401);
    expect(await sessionsOf(me.id)).toEqual([]);
    expect((await getMe(t, stranger.cookie)).status).toBe(200);
  });
});

describe('password change rotation (V34, used by E10)', () => {
  it('rotates_the_current_session_and_kills_the_others', async () => {
    const { email, me, cookie } = await signUp(t);
    const other = sessionCookieOf(await logIn(t, email, PASSWORD));
    const [current] = await sessionsOf(me.id);
    const sessions = t.app.get(SessionService);

    const rotated = await sessions.rotate(current?.id ?? '');
    await sessions.deleteOthersOf(me.id, current?.id ?? '');

    expect((await getMe(t, cookie)).status).toBe(401);
    expect((await getMe(t, other)).status).toBe(401);
    expect((await getMe(t, `hm_session=${rotated.token}`)).status).toBe(200);
    expect(rotated.absoluteExpiresAt).toEqual(current?.absoluteExpiresAt);
  });

  it('writes_the_rotated_token_as_a_cookie', () => {
    const appended: string[] = [];
    const response = { append: (_name: string, value: string) => appended.push(value) };
    const absoluteExpiresAt = new Date(t.clock.now().getTime() + 10_000);

    t.app.get(SessionCookies).set(response as never, { token: 'new-token', absoluteExpiresAt });

    expect(appended).toEqual(['hm_session=new-token; Max-Age=10; Path=/; HttpOnly; SameSite=Lax']);
  });
});
