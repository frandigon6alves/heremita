import { z } from 'zod';
import { currentPasswordSchema, displayNameSchema, passwordSchema } from './auth.js';
import { idSchema, localeSchema, themeSchema, timestampSchema } from './common.js';

export const userRoleSchema = z.enum(['user', 'moderator']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const meSchema = z
  .object({
    id: idSchema,
    email: z.string(),
    displayName: z.string(),
    locale: localeSchema,
    theme: themeSchema,
    role: userRoleSchema,
    isDemo: z.boolean(),
    createdAt: timestampSchema,
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof meSchema>;

export const updateMeBodySchema = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    locale: localeSchema.optional(),
    theme: themeSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' })
  .meta({ id: 'UpdateMeBody' });
export type UpdateMeBody = z.input<typeof updateMeBodySchema>;

export const changePasswordBodySchema = z
  .strictObject({
    currentPassword: currentPasswordSchema,
    newPassword: passwordSchema,
  })
  .meta({ id: 'ChangePasswordBody' });
export type ChangePasswordBody = z.input<typeof changePasswordBodySchema>;

export const deleteAccountBodySchema = z
  .strictObject({ password: currentPasswordSchema })
  .meta({ id: 'DeleteAccountBody' });
export type DeleteAccountBody = z.input<typeof deleteAccountBodySchema>;
