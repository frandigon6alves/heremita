import { z } from 'zod';
import { cursorSchema, limitQuery } from './common.js';
import { LIMITS } from './limits.js';

/** `countryCode` is accepted in either case and returned upper-cased. */
export const publicTripsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(LIMITS.PUBLIC_TRIPS_Q_MAX).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .toUpperCase()
    .optional(),
  limit: limitQuery(LIMITS.PAGE_SIZES.publicTrips.max, LIMITS.PAGE_SIZES.publicTrips.default),
  cursor: cursorSchema.optional(),
});
export type PublicTripsQuery = z.input<typeof publicTripsQuerySchema>;
