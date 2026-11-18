import { ApiProblemError, HttpError } from '@/lib/api/problem';

/**
 * What a failed auth submit means for the form: field errors from 422
 * pointers, the outcomes the forms explain on their own, or a form-level
 * failure.
 */
export type ServerFormError<F extends string> =
  | { kind: 'fields'; fields: readonly F[] }
  | { kind: 'emailTaken' }
  | { kind: 'invalidCredentials' }
  | { kind: 'tooManyAttempts'; retryAfterSeconds: number | null }
  | { kind: 'offline' }
  | { kind: 'unexpected'; requestId: string | null };

/** `/body/password` → `password`; `null` for pointers outside the body. */
function bodyField(pointer: string): string | null {
  const match = /^\/body\/([^/]+)/.exec(pointer);
  return match?.[1] ?? null;
}

function fieldsOf<F extends string>(error: ApiProblemError, fields: readonly F[]): readonly F[] {
  const named = error.fieldErrors.map((fieldError) => bodyField(fieldError.pointer));
  return fields.filter((field) => named.includes(field));
}

/** Classifies an error thrown by `apiFetch` for a form whose inputs are `fields`. */
export function serverFormError<F extends string>(
  error: unknown,
  fields: readonly F[],
): ServerFormError<F> {
  // `fetch` rejects with a TypeError only when no answer came back.
  if (error instanceof TypeError) {
    return { kind: 'offline' };
  }
  if (error instanceof HttpError) {
    return { kind: 'unexpected', requestId: error.requestId };
  }
  if (!(error instanceof ApiProblemError)) {
    return { kind: 'unexpected', requestId: null };
  }
  if (error.status === 429) {
    return { kind: 'tooManyAttempts', retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error.code === 'email_taken') {
    return { kind: 'emailTaken' };
  }
  if (error.code === 'invalid_credentials') {
    return { kind: 'invalidCredentials' };
  }
  if (error.code === 'validation_failed') {
    const matched = fieldsOf(error, fields);
    if (matched.length > 0) {
      return { kind: 'fields', fields: matched };
    }
  }
  return { kind: 'unexpected', requestId: error.requestId };
}

/** Form-level errors: everything except field errors and the e-mail conflict. */
export type FormLevelError = Extract<
  ServerFormError<string>,
  { kind: 'invalidCredentials' | 'tooManyAttempts' | 'offline' | 'unexpected' }
>;

export function isFormLevel<F extends string>(
  error: ServerFormError<F>,
): error is ServerFormError<F> & FormLevelError {
  return error.kind !== 'fields' && error.kind !== 'emailTaken';
}
