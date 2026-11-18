import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  ERROR_STATUS,
  ERROR_TITLES,
  PROBLEM_CONTENT_TYPE,
  type ErrorCode,
  type ProblemDetails,
} from '@heremita/shared';
import type { Request, Response } from 'express';
import { violatedUniqueIndex } from '../prisma-errors.js';
import { ApiProblem, type ProblemExtensions } from './api-problem.js';

/** Statuses the framework or Express middleware answer on their own, by the code they mean. */
const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'malformed_request',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'unsupported_media_type',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
};

const FIXED_DETAILS: Partial<Record<ErrorCode, string>> = {
  malformed_request: 'The request body is not valid JSON.',
  not_found: 'No such resource.',
  payload_too_large: 'The request body is too large.',
  unsupported_media_type: 'Request bodies must be application/json.',
  rate_limited: 'Too many requests; retry later.',
  internal_error: 'An unexpected error occurred.',
};

/** Unique indexes whose violation is the caller's conflict, not our bug. */
const UNIQUE_INDEX_CODES: Record<string, ErrorCode> = {
  users_email_key: 'email_taken',
};

interface Problem {
  code: ErrorCode;
  detail: string;
  extensions?: ProblemExtensions;
  retryAfterSeconds?: number;
}

/** Errors body-parser hands to Express (`entity.parse.failed`, `entity.too.large`, …). */
function bodyParserStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null || !('type' in exception)) {
    return undefined;
  }
  const { type, status } = exception as { type: unknown; status?: unknown };
  return typeof type === 'string' && type.startsWith('entity.') && typeof status === 'number'
    ? status
    : undefined;
}

function toProblem(exception: unknown): Problem | undefined {
  if (exception instanceof ApiProblem) {
    return exception;
  }
  if (exception instanceof ThrottlerException) {
    return { code: 'rate_limited', detail: FIXED_DETAILS.rate_limited ?? '' };
  }
  const status =
    exception instanceof HttpException ? exception.getStatus() : bodyParserStatus(exception);
  const statusCode = status === undefined ? undefined : STATUS_CODES[status];
  const uniqueCode = UNIQUE_INDEX_CODES[violatedUniqueIndex(exception) ?? ''];
  const code = statusCode ?? uniqueCode;
  return code ? { code, detail: FIXED_DETAILS[code] ?? ERROR_TITLES[code] } : undefined;
}

/**
 * Answers every error with an RFC 9457 problem document carrying a stable
 * `code` (§I.api.mechanics "Exception filter"). Anything not mapped is a bug:
 * logged once (with the request id, via the request-scoped logger) and
 * answered as 500 `internal_error` with no internal detail.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    let problem = toProblem(exception);
    if (!problem) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Non-error thrown',
        exception instanceof Error ? exception.stack : undefined,
      );
      problem = { code: 'internal_error', detail: FIXED_DETAILS.internal_error ?? '' };
    }

    const status = ERROR_STATUS[problem.code];
    const body: ProblemDetails = {
      type: `urn:heremita:problem:${problem.code}`,
      title: ERROR_TITLES[problem.code],
      status,
      detail: problem.detail,
      instance: request.originalUrl.split('?', 1)[0] ?? '',
      code: problem.code,
      ...problem.extensions,
    };
    if (problem.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(problem.retryAfterSeconds));
    }
    response
      .status(status)
      .setHeader('Cache-Control', 'no-store')
      .type(PROBLEM_CONTENT_TYPE)
      .json(body);
  }
}
