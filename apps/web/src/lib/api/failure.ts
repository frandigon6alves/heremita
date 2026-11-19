import type { ErrorCode } from '@heremita/shared';
import { ApiProblemError, HttpError } from './problem';

/** `fetch` rejects with a TypeError only when the request never got an HTTP answer. */
export function isNetworkError(error: unknown): error is TypeError {
  return error instanceof TypeError;
}

/** `X-Request-Id` of a failed call, quoted next to "try again" messages. */
export function requestIdOf(error: unknown): string | null {
  return error instanceof ApiProblemError || error instanceof HttpError ? error.requestId : null;
}

/** Stable API code of a failed call, or `null` (no answer, or no problem document). */
export function problemCodeOf(error: unknown): string | null {
  return error instanceof ApiProblemError ? error.code : null;
}

/** The API refused the call with `code`. */
export function hasCode(error: unknown, code: ErrorCode): error is ApiProblemError {
  return error instanceof ApiProblemError && error.code === code;
}

/** Body paths a 422 named (`/body/destination/name` → `['destination', 'name']`). */
export function bodyPathsOf(error: unknown): string[][] {
  if (!(error instanceof ApiProblemError) || error.status !== 422) {
    return [];
  }
  return error.fieldErrors
    .filter(({ pointer }) => pointer.startsWith('/body/'))
    .map(({ pointer }) => pointer.slice('/body/'.length).split('/'));
}

/** Which of a form's `fields` a 422 named, in the form's order. */
export function bodyFieldsOf<F extends string>(error: unknown, fields: readonly F[]): F[] {
  const named = new Set(bodyPathsOf(error).map(([field]) => field));
  return fields.filter((field) => named.has(field));
}

/** A failed call as every screen explains it, before any code the screen handles itself. */
export type Failure =
  { kind: 'offline' } | { kind: 'tooMany'; retryAfterSeconds: number | null } | { kind: 'failed' };

export function classifyFailure(error: unknown): Failure {
  if (isNetworkError(error)) {
    return { kind: 'offline' };
  }
  if (error instanceof ApiProblemError && error.status === 429) {
    return { kind: 'tooMany', retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error instanceof HttpError && error.status === 429) {
    return { kind: 'tooMany', retryAfterSeconds: null };
  }
  return { kind: 'failed' };
}
