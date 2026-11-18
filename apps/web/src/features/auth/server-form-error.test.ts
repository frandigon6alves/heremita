import type { ProblemDetails } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { ApiProblemError, HttpError } from '@/lib/api/problem';
import { isFormLevel, serverFormError } from './server-form-error';

const FIELDS = ['displayName', 'email', 'password'] as const;

function problem(overrides: Partial<ProblemDetails> & Pick<ProblemDetails, 'status' | 'code'>) {
  return new ApiProblemError(
    {
      type: `urn:heremita:problem:${overrides.code}`,
      title: 'Title',
      detail: 'Detail',
      instance: '/api/v1/users',
      ...overrides,
    },
    'req-12345678',
    null,
  );
}

describe('serverFormError', () => {
  it('maps_422_body_pointers_to_form_fields_in_form_order', () => {
    const error = problem({
      status: 422,
      code: 'validation_failed',
      errors: [
        { pointer: '/body/password', detail: 'Too common' },
        { pointer: '/body/displayName', detail: 'Too long' },
      ],
    });

    expect(serverFormError(error, FIELDS)).toEqual({
      kind: 'fields',
      fields: ['displayName', 'password'],
    });
  });

  it('maps_a_nested_pointer_to_its_top_level_field', () => {
    const error = problem({
      status: 422,
      code: 'validation_failed',
      errors: [{ pointer: '/body/email/0', detail: 'x' }],
    });

    expect(serverFormError(error, FIELDS)).toEqual({ kind: 'fields', fields: ['email'] });
  });

  it('treats_a_422_without_known_fields_as_unexpected', () => {
    const error = problem({
      status: 422,
      code: 'validation_failed',
      errors: [{ pointer: '/body/locale', detail: 'Invalid' }],
    });

    expect(serverFormError(error, FIELDS)).toEqual({
      kind: 'unexpected',
      requestId: 'req-12345678',
    });
  });

  it('recognises_email_taken', () => {
    expect(serverFormError(problem({ status: 409, code: 'email_taken' }), FIELDS)).toEqual({
      kind: 'emailTaken',
    });
  });

  it('recognises_invalid_credentials', () => {
    expect(serverFormError(problem({ status: 401, code: 'invalid_credentials' }), FIELDS)).toEqual({
      kind: 'invalidCredentials',
    });
  });

  it.each(['too_many_attempts', 'rate_limited'])('reads_retry_after_of_429_%s', (code) => {
    const error = new ApiProblemError(
      {
        type: `urn:heremita:problem:${code}`,
        title: 'Title',
        status: 429,
        detail: 'Slow down',
        instance: '/api/v1/sessions',
        code,
      },
      null,
      840,
    );

    expect(serverFormError(error, FIELDS)).toEqual({
      kind: 'tooManyAttempts',
      retryAfterSeconds: 840,
    });
  });

  it('reports_a_network_failure_as_offline', () => {
    expect(serverFormError(new TypeError('Failed to fetch'), FIELDS)).toEqual({
      kind: 'offline',
    });
  });

  it('reports_an_answer_without_problem_document_as_unexpected', () => {
    expect(serverFormError(new HttpError(502, 'req-abcdefgh'), FIELDS)).toEqual({
      kind: 'unexpected',
      requestId: 'req-abcdefgh',
    });
  });

  it('reports_any_other_problem_as_unexpected', () => {
    expect(serverFormError(problem({ status: 500, code: 'internal_error' }), FIELDS)).toEqual({
      kind: 'unexpected',
      requestId: 'req-12345678',
    });
  });

  it('keeps_field_errors_and_email_taken_out_of_the_form_level_alert', () => {
    expect(isFormLevel({ kind: 'fields', fields: ['email'] })).toBe(false);
    expect(isFormLevel({ kind: 'emailTaken' })).toBe(false);
    expect(isFormLevel({ kind: 'offline' })).toBe(true);
  });
});
