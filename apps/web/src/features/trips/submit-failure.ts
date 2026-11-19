import { ApiProblemError, HttpError } from '@/lib/api/problem';

/** What a failed trip write means for the screen that sent it. */
export type SubmitFailure =
  /** 422: body paths the API refused (`/body/destination/name` → `['destination', 'name']`). */
  | { kind: 'fields'; paths: ReadonlyArray<readonly string[]> }
  /** 409 `limit_reached`: too many trips (create, duplicate). */
  | { kind: 'limit' }
  /** No answer at all (`fetch` rejected). */
  | { kind: 'offline' }
  | { kind: 'unexpected'; code: string | null; requestId: string | null };

function bodyPath(pointer: string): string[] | null {
  return pointer.startsWith('/body/') ? pointer.slice('/body/'.length).split('/') : null;
}

/** Classifies an error thrown by `apiFetch` for a trip form or action. */
export function submitFailure(error: unknown): SubmitFailure {
  if (error instanceof TypeError) {
    return { kind: 'offline' };
  }
  if (error instanceof HttpError) {
    return { kind: 'unexpected', code: null, requestId: error.requestId };
  }
  if (!(error instanceof ApiProblemError)) {
    return { kind: 'unexpected', code: null, requestId: null };
  }
  if (error.code === 'limit_reached') {
    return { kind: 'limit' };
  }
  if (error.code === 'validation_failed') {
    const paths = error.fieldErrors
      .map((fieldError) => bodyPath(fieldError.pointer))
      .filter((path) => path !== null);
    if (paths.length > 0) {
      return { kind: 'fields', paths };
    }
  }
  return { kind: 'unexpected', code: error.code, requestId: error.requestId };
}
