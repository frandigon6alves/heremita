import { ApiProblemError, HttpError } from '@/lib/api/problem';

/** `X-Request-Id` of a failed call, quoted next to "try again" messages. */
export function requestIdOf(error: unknown): string | null {
  return error instanceof ApiProblemError || error instanceof HttpError ? error.requestId : null;
}

/** Stable API code of a failed call, or `null` (network failure, no problem document). */
export function problemCodeOf(error: unknown): string | null {
  return error instanceof ApiProblemError ? error.code : null;
}
