/** Header that carries one request's id from the proxy through the render to the API (and back). */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** The format the API accepts for an incoming request id (it generates one otherwise). */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** `value` when a hop in front sent a usable id, else a fresh one. */
export function requestIdOrNew(value: string | null | undefined): string {
  return value != null && REQUEST_ID_PATTERN.test(value) ? value : crypto.randomUUID();
}
