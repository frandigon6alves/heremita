import { describe, expect, it } from 'vitest';
import { problemDetailsSchema } from './problem.js';

const notReady = {
  type: 'urn:heremita:problem:database_unavailable',
  title: 'Database unavailable',
  status: 503,
  detail: 'The database is not reachable.',
  instance: '/api/v1/health/ready',
  code: 'database_unavailable',
};

describe('problemDetailsSchema', () => {
  it('accepts_a_problem_without_optional_members', () => {
    const result = problemDetailsSchema.safeParse(notReady);

    expect(result).toEqual({ success: true, data: notReady });
  });

  it('accepts_field_errors', () => {
    const invalid = {
      ...notReady,
      title: 'Validation failed',
      status: 422,
      code: 'validation_failed',
      errors: [{ pointer: '/body/title', detail: 'Required' }],
    };

    expect(problemDetailsSchema.safeParse(invalid).success).toBe(true);
  });

  it('keeps_the_plan_changed_and_place_already_in_trip_extensions', () => {
    const conflict = {
      ...notReady,
      status: 409,
      code: 'place_already_in_trip',
      currentPlanVersion: 7,
      tripPlaceId: '0193a000-0000-7000-8000-000000000101',
    };

    expect(problemDetailsSchema.parse(conflict)).toEqual(conflict);
  });

  it('accepts_a_code_unknown_to_this_client', () => {
    expect(problemDetailsSchema.safeParse({ ...notReady, code: 'added_later' }).success).toBe(true);
  });

  it('rejects_a_problem_without_code', () => {
    const withoutCode = { ...notReady, code: undefined };

    expect(problemDetailsSchema.safeParse(withoutCode).success).toBe(false);
  });

  it('rejects_a_status_that_is_not_an_error', () => {
    expect(problemDetailsSchema.safeParse({ ...notReady, status: 200 }).success).toBe(false);
  });
});
