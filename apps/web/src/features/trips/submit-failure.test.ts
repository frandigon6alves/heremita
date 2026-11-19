import type { ProblemDetails } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { ApiProblemError, HttpError } from '@/lib/api/problem';
import { submitFailure } from './submit-failure';

function problem(code: string, extras: Partial<ProblemDetails> = {}): ApiProblemError {
  return new ApiProblemError(
    {
      type: `urn:heremita:problem:${code}`,
      title: code,
      status: 422,
      detail: code,
      instance: '/api/v1/trips',
      code,
      ...extras,
    },
    'req-1',
  );
}

describe('submitFailure', () => {
  it('reads_body_pointers_as_paths', () => {
    const error = problem('validation_failed', {
      errors: [
        { pointer: '/body/destination/name', detail: 'Too long' },
        { pointer: '/query/limit', detail: 'Ignored' },
      ],
    });

    expect(submitFailure(error)).toEqual({ kind: 'fields', paths: [['destination', 'name']] });
  });

  it('treats_a_validation_failure_without_body_pointers_as_unexpected', () => {
    expect(submitFailure(problem('validation_failed'))).toEqual({
      kind: 'unexpected',
      code: 'validation_failed',
      requestId: 'req-1',
    });
  });

  it('recognises_the_trip_limit', () => {
    expect(submitFailure(problem('limit_reached', { status: 409 }))).toEqual({ kind: 'limit' });
  });

  it('reads_a_rejected_fetch_as_offline', () => {
    expect(submitFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'offline' });
  });

  it('keeps_the_request_id_of_an_answer_without_problem_document', () => {
    expect(submitFailure(new HttpError(502, 'req-2'))).toEqual({
      kind: 'unexpected',
      code: null,
      requestId: 'req-2',
    });
  });
});
