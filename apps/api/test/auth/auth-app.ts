import type { Me } from '@heremita/shared';
import type request from 'supertest';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';

export { buildTestApp as startAuthApp, WEB_ORIGIN };
export type AuthTestApp = TestApp;
export const PASSWORD = 'correct horse battery';

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
