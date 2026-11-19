import { ApiProblemError, HttpError } from '@/lib/api/problem';

/** A failed submit that no single field explains. */
export type SubmitFailure = 'offline' | 'tooMany' | 'failed';

/** How a failed submit reaches a form: the fields the API named, or one form-level failure. */
export type SubmitOutcome<F extends string> =
  | { kind: 'fields'; fields: readonly F[]; wrongPassword: boolean }
  | { kind: 'form'; failure: SubmitFailure; requestId: string | null };

/** `/body/newPassword` → `newPassword`. */
function bodyField(pointer: string): string | undefined {
  return /^\/body\/([^/]+)/.exec(pointer)?.[1];
}

/** Classifies an error thrown by `apiFetch` for a form whose inputs are `fields`. */
export function submitOutcome<F extends string>(
  error: unknown,
  fields: readonly F[],
): SubmitOutcome<F> {
  if (error instanceof ApiProblemError && error.status === 422) {
    const named = error.fieldErrors.map(({ pointer }) => bodyField(pointer));
    const matched = fields.filter((field) => named.includes(field));
    if (matched.length > 0) {
      return { kind: 'fields', fields: matched, wrongPassword: error.code === 'wrong_password' };
    }
  }
  return { kind: 'form', failure: failureOf(error), requestId: requestIdOf(error) };
}

function failureOf(error: unknown): SubmitFailure {
  // `fetch` rejects with a TypeError only when no answer came back.
  if (error instanceof TypeError) {
    return 'offline';
  }
  if (error instanceof ApiProblemError && error.status === 429) {
    return 'tooMany';
  }
  return 'failed';
}

/** `X-Request-Id` of a failed call, quoted next to "try again" messages. */
export function requestIdOf(error: unknown): string | null {
  return error instanceof ApiProblemError || error instanceof HttpError ? error.requestId : null;
}
