import type { Instrumentation } from 'next';
import { REQUEST_ID_HEADER } from './lib/api/request-id';

/** The id `proxy.ts` gave the request; the render sent the same one to the API. */
function requestIdOf(headers: Parameters<Instrumentation.onRequestError>[1]['headers']) {
  const value = headers[REQUEST_ID_HEADER.toLowerCase()];
  return typeof value === 'string' ? value : null;
}

/**
 * One JSON line on stderr per failed server render, route handler or proxy
 * run: the `digest` the error page shows the user next to the request id the
 * API logged, so a reported digest leads to the API's log lines. The query
 * string is left out (it can hold search text).
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'request failed',
      digest:
        typeof error === 'object' && error !== null && 'digest' in error
          ? String(error.digest)
          : null,
      requestId: requestIdOf(request.headers),
      method: request.method,
      path: request.path.split('?')[0],
      route: context.routePath,
      routeType: context.routeType,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};
