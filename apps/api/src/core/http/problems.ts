import type { ProblemFieldError } from '@heremita/shared';
import { ApiProblem } from './api-problem.js';

// Problems raised from more than one module, so each wording lives in one place.

export function unauthenticated(): ApiProblem {
  return new ApiProblem('unauthenticated', 'Sign in to continue.');
}

/** 422 for checks the request schema cannot express (a common password, a future month …). */
export function invalidFields(errors: ProblemFieldError[]): ApiProblem {
  return new ApiProblem('validation_failed', 'The request has invalid fields.', { errors });
}

/** Also the answer for someone else's private trip (404, never 403). */
export function tripNotFound(): ApiProblem {
  return new ApiProblem('trip_not_found', 'No such trip.');
}

export function dayNotFound(): ApiProblem {
  return new ApiProblem('not_found', 'No such day in this trip.');
}

export function userNotFound(): ApiProblem {
  return new ApiProblem('user_not_found', 'No such user.');
}

export function placeNotFound(): ApiProblem {
  return new ApiProblem('place_not_found', 'No such place.');
}
