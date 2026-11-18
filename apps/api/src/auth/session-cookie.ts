import type { IncomingHttpHeaders } from 'node:http';

/** `__Host-` requires `Secure`, so plain-HTTP setups (dev, e2e) use the bare name (CD4). */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-hm_session' : 'hm_session';
}

function attributes(maxAgeSeconds: number, secure: boolean): string {
  const parts = [`Max-Age=${maxAgeSeconds}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * `Set-Cookie` value carrying a session token. It lives until the session's
 * absolute expiry; idle expiry is enforced server-side only, so the cookie is
 * never re-sent when the session slides. No `Expires`: it would come from the
 * system clock, `Max-Age` is relative and enough for every current browser.
 */
export function sessionCookie(
  token: string,
  absoluteExpiresAt: Date,
  now: Date,
  secure: boolean,
): string {
  const maxAge = Math.max(0, Math.floor((absoluteExpiresAt.getTime() - now.getTime()) / 1000));
  return `${sessionCookieName(secure)}=${token}; ${attributes(maxAge, secure)}`;
}

/** `Set-Cookie` value that makes the browser drop the session cookie. */
export function clearedSessionCookie(secure: boolean): string {
  return `${sessionCookieName(secure)}=; ${attributes(0, secure)}`;
}

/** The session token the request carries, if any. Tokens are base64url, so no decoding is needed. */
export function readSessionToken(headers: IncomingHttpHeaders, secure: boolean): string | null {
  const name = sessionCookieName(secure);
  for (const pair of (headers.cookie ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      const value = pair.slice(separator + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}
