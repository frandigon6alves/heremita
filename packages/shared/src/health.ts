import { z } from 'zod';

/** Body of `GET /api/v1/health` (liveness): the process answers. Nothing external is checked. */
export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/**
 * Body of `GET /api/v1/health/ready` when the API can serve requests: its
 * database pool ran a query. Otherwise the endpoint answers 503 with a problem
 * document (see problem.ts).
 */
export const readinessResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.literal('up'),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
