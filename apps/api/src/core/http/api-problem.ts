import { HttpException } from '@nestjs/common';
import { ERROR_STATUS, type ErrorCode, type ProblemFieldError } from '@heremita/shared';

/** Members a problem document may carry besides the RFC 9457 ones and `code`. */
export interface ProblemExtensions {
  errors?: ProblemFieldError[];
  currentPlanVersion?: number;
  tripPlaceId?: string;
}

/**
 * An error the API answers on purpose. The status comes from the code, so a
 * code and its status can never disagree; `ProblemDetailsFilter` writes the body.
 */
export class ApiProblem extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly detail: string,
    readonly extensions: ProblemExtensions = {},
    /** Sent as `Retry-After` (seconds). */
    readonly retryAfterSeconds?: number,
  ) {
    super(detail, ERROR_STATUS[code]);
  }
}
