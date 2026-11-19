import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import type { Env } from '../../config/env.js';
import type { ApiRequest } from '../http/api-request.js';
import { uuidv7 } from '../ids/uuidv7.js';

/** An incoming `X-Request-Id` is reused only when it looks like an id, never as free text. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Secrets and private data never written to a log line (V47). Request bodies,
 * URLs and query strings are not logged at all; these paths cover objects a
 * developer passes to the logger by hand.
 */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
  'headers["set-cookie"]',
  'password',
  'currentPassword',
  'newPassword',
  'token',
  'shareToken',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.shareToken',
];

/** Reuses a well-formed incoming request id or makes one, and echoes it to the client. */
export function requestId(request: IncomingMessage, response: ServerResponse): string {
  const incoming = request.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : uuidv7();
  response.setHeader('X-Request-Id', id);
  return id;
}

/**
 * Fields of the access log line. The route template (`/api/v1/shared/:shareToken/plan`)
 * stands in for the URL, which can hold a share token, search text or coordinates.
 */
export function accessLogFields(request: IncomingMessage, response: ServerResponse) {
  const { user } = request as ApiRequest;
  const route = (request as { route?: { path?: unknown } }).route;
  return {
    method: request.method,
    route: typeof route?.path === 'string' ? route.path : null,
    status: response.statusCode,
    userId: user?.id ?? null,
  };
}

function responseTime(value: unknown): unknown {
  return (value as { responseTime?: unknown }).responseTime;
}

/** `nestjs-pino` configuration: one JSON line per request on stdout, pretty in development. */
export function loggerParams(env: Env, destination?: DestinationStream): Params {
  // SHORTCUT(owner): no OpenTelemetry, latency only in access logs — ceiling: no traces across web→api→provider; upgrade: first production incident logs cannot explain, or a second API instance
  const options: Options = {
    // Test runs stay quiet unless a test captures the log itself.
    level: env.NODE_ENV === 'test' && !destination ? 'silent' : env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    genReqId: requestId,
    quietReqLogger: true,
    quietResLogger: true,
    customLogLevel: () => 'info',
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
    customSuccessObject: (request, response, value) => ({
      ...accessLogFields(request, response),
      responseTime: responseTime(value),
    }),
    customErrorObject: (request, response, _error, value) => ({
      ...accessLogFields(request, response),
      responseTime: responseTime(value),
    }),
    transport:
      env.NODE_ENV === 'development' && !destination ? { target: 'pino-pretty' } : undefined,
  };
  return { pinoHttp: destination ? [options, destination] : options };
}
