import type { IncomingHttpHeaders } from 'node:http';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type CsrfVerdict = 'allowed' | 'cross_site' | 'not_json';

/** A body is present when it is chunked or has a non-zero length. */
function hasBody(headers: IncomingHttpHeaders): boolean {
  if (headers['transfer-encoding'] !== undefined) {
    return true;
  }
  const length = Number(headers['content-length'] ?? 0);
  return Number.isNaN(length) || length > 0;
}

function isJson(headers: IncomingHttpHeaders): boolean {
  const mediaType = headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}

/**
 * Cross-site request defence for unsafe methods (§I.api.mechanics "CSRF guard").
 * `Sec-Fetch-Site` decides when the browser sent it (`same-site` is refused:
 * another app on a sibling localhost port is same-site); otherwise `Origin`
 * must equal the web origin exactly. A body must then be JSON, which also
 * shuts out HTML form posts.
 */
export function csrfVerdict(
  method: string,
  headers: IncomingHttpHeaders,
  webOrigin: string,
): CsrfVerdict {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) {
    return 'allowed';
  }
  const fetchSite = headers['sec-fetch-site'];
  const sameOrigin =
    fetchSite === undefined ? headers.origin === webOrigin : fetchSite === 'same-origin';
  if (!sameOrigin) {
    return 'cross_site';
  }
  return hasBody(headers) && !isJson(headers) ? 'not_json' : 'allowed';
}
