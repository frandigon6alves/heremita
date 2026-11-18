import { z } from 'zod';
import { idSchema } from './common.js';

/** Media type of every error response of the API (RFC 9457). */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** One invalid input of a 422 response; `pointer` is a JSON Pointer rooted at the request part (`/body/stopIds/3`). */
export const problemFieldErrorSchema = z
  .object({
    pointer: z.string(),
    detail: z.string(),
  })
  .meta({ id: 'ProblemFieldError' });

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;

/**
 * Error body of the API: RFC 9457 problem details. `code` is the stable
 * identifier clients branch on (an `ErrorCode`; typed as a string so a newer
 * API code never makes an older client fail to parse the error).
 */
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.int().min(400).max(599),
    detail: z.string(),
    instance: z.string(),
    code: z.string(),
    errors: z.array(problemFieldErrorSchema).optional(),
    currentPlanVersion: z.int().min(0).optional(),
    tripPlaceId: idSchema.optional(),
  })
  .meta({ id: 'ProblemDetails' });

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
