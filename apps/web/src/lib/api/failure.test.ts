import type { ProblemDetails } from '@heremita/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  bodyFieldsOf,
  bodyPathsOf,
  classifyFailure,
  hasCode,
  isNetworkError,
  problemCodeOf,
  requestIdOf,
  SERVER_ERROR,
  showFieldErrors,
} from './failure';
import { ApiProblemError, HttpError } from './problem';

function problem(
  code: string,
  status: number,
  extras: Partial<ProblemDetails> = {},
  retryAfterSeconds: number | null = null,
): ApiProblemError {
  return new ApiProblemError(
    {
      type: 'about:blank',
      title: code,
      status,
      detail: code,
      instance: '/api/v1',
      code,
      ...extras,
    },
    'req-1234',
    retryAfterSeconds,
  );
}

describe('failure classification', () => {
  it('reads_code_and_request_id_from_both_kinds_of_http_failure', () => {
    expect(problemCodeOf(problem('internal_error', 500))).toBe('internal_error');
    expect(requestIdOf(problem('internal_error', 500))).toBe('req-1234');
    expect(problemCodeOf(new HttpError(502, 'req-5678'))).toBeNull();
    expect(requestIdOf(new HttpError(502, 'req-5678'))).toBe('req-5678');
    expect(requestIdOf(new TypeError('Failed to fetch'))).toBeNull();
  });

  it('recognises_a_request_that_got_no_answer', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new HttpError(502))).toBe(false);
  });

  it('narrows_on_a_known_code', () => {
    const error: unknown = problem('limit_reached', 409);

    expect(hasCode(error, 'limit_reached')).toBe(true);
    expect(hasCode(error, 'day_full')).toBe(false);
    expect(hasCode(new HttpError(409), 'limit_reached')).toBe(false);
  });

  it('maps_422_pointers_to_body_paths_and_form_fields_whatever_the_code', () => {
    const error = problem('wrong_password', 422, {
      errors: [
        { pointer: '/body/currentPassword', detail: 'wrong' },
        { pointer: '/body/destination/name', detail: 'too long' },
        { pointer: '/query/limit', detail: 'ignored' },
      ],
    });

    expect(bodyPathsOf(error)).toEqual([['currentPassword'], ['destination', 'name']]);
    expect(bodyFieldsOf(error, ['newPassword', 'destination', 'currentPassword'])).toEqual([
      'destination',
      'currentPassword',
    ]);
    expect(bodyFieldsOf(problem('internal_error', 500), ['title'])).toEqual([]);
  });

  it('classifies_offline_too_many_and_everything_else', () => {
    expect(classifyFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'offline' });
    expect(classifyFailure(problem('rate_limited', 429, {}, 42))).toEqual({
      kind: 'tooMany',
      retryAfterSeconds: 42,
    });
    expect(classifyFailure(new HttpError(429))).toEqual({
      kind: 'tooMany',
      retryAfterSeconds: null,
    });
    expect(classifyFailure(problem('internal_error', 500))).toEqual({ kind: 'failed' });
    expect(classifyFailure(new Error('boom'))).toEqual({ kind: 'failed' });
  });
});

describe('showFieldErrors', () => {
  it('marks_every_field_and_focuses_only_the_first', () => {
    const setError = vi.fn();

    const shown = showFieldErrors<{ email: string; password: string }>(setError, [
      'email',
      'password',
    ]);

    expect(shown).toBe(true);
    expect(setError.mock.calls).toEqual([
      ['email', { type: SERVER_ERROR }, { shouldFocus: true }],
      ['password', { type: SERVER_ERROR }, { shouldFocus: false }],
    ]);
  });

  it('uses_the_given_type', () => {
    const setError = vi.fn();

    showFieldErrors<{ password: string }>(setError, ['password'], 'wrong');

    expect(setError).toHaveBeenCalledWith('password', { type: 'wrong' }, { shouldFocus: true });
  });

  it('answers_false_and_marks_nothing_without_fields', () => {
    const setError = vi.fn();

    expect(showFieldErrors<{ email: string }>(setError, [])).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
