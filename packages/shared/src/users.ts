import { z } from 'zod';
import { idSchema, yearMonthSchema } from './common.js';

export const userProfileSchema = z
  .object({
    id: idSchema,
    displayName: z.string(),
    isDemo: z.boolean(),
    joinedMonth: yearMonthSchema,
    publicTripCount: z.int().min(0),
    reviewCount: z.int().min(0),
  })
  .meta({ id: 'UserProfile' });
export type UserProfile = z.infer<typeof userProfileSchema>;
