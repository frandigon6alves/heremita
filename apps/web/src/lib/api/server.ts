import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { endpoints, type EndpointDef, type EndpointOutput, type Me } from '@heremita/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { env } from '@/env';
import { errorFromResponse, isUnauthenticated, REQUEST_ID_HEADER } from './problem';
import { endpointPath, type RequestArgs, type UntypedOptions } from './request';

/** A server render must not hang on the API: past this the page shows its error state. */
export const SERVER_FETCH_TIMEOUT_MS = 5000;

/** The format the API accepts for an incoming request id (it generates one otherwise). */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * One request id per page render, shared by every API call of that render:
 * the incoming one when a proxy set a valid one, else a fresh UUID.
 */
const renderRequestId = cache(async (): Promise<string> => {
  const incoming = (await headers()).get(REQUEST_ID_HEADER);
  return incoming !== null && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
});

/**
 * The browser's address, vouched for with `SERVER_FETCH_SECRET` so the API keys
 * its anonymous rate limits on the visitor instead of on this server's egress
 * address. Same names and format as `apps/api/src/core/http/client-address.ts`.
 */
export const CLIENT_IP_HEADER = 'X-Heremita-Client-Ip';
export const CLIENT_IP_SIGNATURE_HEADER = 'X-Heremita-Client-Ip-Signature';

/** `<unix ms>.<hex HMAC-SHA256>` over the address and the time, as the API checks it. */
export function signClientIp(secret: string, ip: string, timestampMs: number): string {
  const mac = createHmac('sha256', secret)
    .update(`heremita-client-ip:v1\n${ip}\n${timestampMs}`)
    .digest('hex');
  return `${timestampMs}.${mac}`;
}

/**
 * The address of the browser that asked for this render: the last
 * `X-Forwarded-For` entry, which the hop in front of Next wrote (Vercel
 * overwrites the header; a self-hosted proxy must too, see README). Next fills
 * it from the socket when no proxy set it. `null` when absent or not an address.
 */
const renderClientIp = cache(async (): Promise<string | null> => {
  const forwarded = (await headers()).get('x-forwarded-for');
  const last = forwarded?.split(',').at(-1)?.trim() ?? '';
  return isIP(last) === 0 ? null : last;
});

type GetEndpoint = EndpointDef & { method: 'GET' };

/**
 * Server Components → API (server to server, `API_URL`). Read-only: mutations
 * always go browser → `/api/v1` so the API's CSRF check sees the real origin.
 * Forwards only the session cookie, the request id and the browser's address
 * (signed, only when `SERVER_FETCH_SECRET` is set), nothing else of the
 * incoming request. Errors as `apiFetch`; a timeout rejects with the abort error.
 */
export async function serverFetch<const E extends GetEndpoint>(
  def: E,
  ...[options]: RequestArgs<E>
): Promise<EndpointOutput<E>> {
  const { params, query }: UntypedOptions = options ?? {};
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    [REQUEST_ID_HEADER]: await renderRequestId(),
  };
  const session = (await cookies()).get(env.SESSION_COOKIE_NAME);
  if (session !== undefined) {
    requestHeaders.Cookie = `${env.SESSION_COOKIE_NAME}=${session.value}`;
  }
  const clientIp = await renderClientIp();
  if (env.SERVER_FETCH_SECRET !== null && clientIp !== null) {
    requestHeaders[CLIENT_IP_HEADER] = clientIp;
    requestHeaders[CLIENT_IP_SIGNATURE_HEADER] = signClientIp(
      env.SERVER_FETCH_SECRET,
      clientIp,
      Date.now(),
    );
  }

  const response = await fetch(`${env.API_URL}${endpointPath(def, { params, query })}`, {
    headers: requestHeaders,
    cache: 'no-store',
    signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return (await response.json()) as EndpointOutput<E>;
}

/**
 * The signed-in user, or `null` when signed out (no cookie, or the API answers
 * 401 for an expired one). Memoised per render: layout, gate and page share one
 * call. Other failures throw; callers that can render anonymously catch them.
 */
export const getViewer = cache(async (): Promise<Me | null> => {
  if (!(await cookies()).has(env.SESSION_COOKIE_NAME)) {
    return null;
  }
  try {
    return await serverFetch(endpoints.getMe);
  } catch (error) {
    if (isUnauthenticated(error)) {
      return null;
    }
    throw error;
  }
});
