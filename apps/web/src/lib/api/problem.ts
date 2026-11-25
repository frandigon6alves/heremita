import type { ProblemDetails, ProblemFieldError } from '@heremita/shared';
import { REQUEST_ID_HEADER } from './request-id';

/** The API answered with an RFC 9457 problem document. */
export class ApiProblemError extends Error {
  override readonly name = 'ApiProblemError';

  constructor(
    readonly problem: ProblemDetails,
    /** `X-Request-Id` of the response, quoted in error states. */
    readonly requestId: string | null = null,
    /** `Retry-After` in seconds (429, 503 `geocoding_busy`); `null` when absent. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`${problem.status} ${problem.code}: ${problem.detail}`);
  }

  get status(): number {
    return this.problem.status;
  }

  /** Stable error code (`ErrorCode`), the value callers branch on. */
  get code(): string {
    return this.problem.code;
  }

  /** Field errors of a 422 (`pointer` rooted at `/body`, `/query`); empty otherwise. */
  get fieldErrors(): readonly ProblemFieldError[] {
    return this.problem.errors ?? [];
  }

  /** On 409 `plan_changed`: the plan version the server holds now. */
  get currentPlanVersion(): number | undefined {
    return this.problem.currentPlanVersion;
  }

  /** On 409 `place_already_in_trip`: the trip place that already holds the place. */
  get tripPlaceId(): string | undefined {
    return this.problem.tripPlaceId;
  }
}

/**
 * A non-2xx answer without a problem document: something in front of the API
 * answered (API down behind the rewrite, gateway timeout).
 */
export class HttpError extends Error {
  override readonly name = 'HttpError';

  constructor(
    readonly status: number,
    readonly requestId: string | null = null,
  ) {
    super(`The server answered HTTP ${status} without a problem document`);
  }
}

/** Either kind of HTTP failure. Network failures stay `TypeError` (see `shouldRetryQuery`). */
type ResponseError = ApiProblemError | HttpError;

/** The session is missing or expired (⊥ `invalid_credentials`, a wrong password on login). */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiProblemError && error.code === 'unauthenticated';
}

/** `Retry-After` as delay-seconds; the API never sends the HTTP-date form. */
function parseRetryAfter(value: string | null): number | null {
  const trimmed = value?.trim() ?? '';
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * Turns a non-2xx response into an error, parsing its body with the shared
 * problem schema. The schema (and zod) load on the first failure only, so pages
 * that never fail never download them.
 */
export async function errorFromResponse(response: Response): Promise<ResponseError> {
  const requestId = response.headers.get(REQUEST_ID_HEADER);
  const body: Promise<unknown> = response.json().catch(() => null);
  const { problemDetailsSchema } = await import('./problem-schema');
  const parsed = problemDetailsSchema.safeParse(await body);
  if (parsed.success) {
    return new ApiProblemError(
      parsed.data,
      requestId,
      parseRetryAfter(response.headers.get('Retry-After')),
    );
  }
  return new HttpError(response.status, requestId);
}
