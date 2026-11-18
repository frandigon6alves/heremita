import { z } from 'zod';
import { localeSchema } from './common.js';
import { LIMITS } from './limits.js';
import { textSchema } from './text.js';

/** E-mail, trimmed and lower-cased before it is validated: `" A@b.com"` → `"a@b.com"`. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(LIMITS.EMAIL_MAX))
  .meta({ override: { format: 'email', maxLength: LIMITS.EMAIL_MAX } });

/** New password: length only (NIST 800-63B, no composition rules); the API also rejects common passwords. */
export const passwordSchema = z.string().min(LIMITS.PASSWORD_MIN).max(LIMITS.PASSWORD_MAX);

/** Password typed to prove identity: any stored password must pass, so only the bounds apply. */
export const currentPasswordSchema = z.string().min(1).max(LIMITS.PASSWORD_MAX);

export const displayNameSchema = textSchema(1, LIMITS.DISPLAY_NAME_MAX);

function isDerivedFromEmail(password: string, email: string): boolean {
  const candidate = password.toLowerCase();
  const localPart = email.slice(0, email.lastIndexOf('@'));
  return candidate === email || candidate === localPart;
}

export const signUpBodySchema = z
  .strictObject({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
    locale: localeSchema,
  })
  .refine((body) => !isDerivedFromEmail(body.password, body.email), {
    message: 'Password must not be the e-mail address',
    path: ['password'],
  })
  .meta({ id: 'SignUpBody' });
export type SignUpBody = z.input<typeof signUpBodySchema>;

export const logInBodySchema = z
  .strictObject({
    email: emailSchema,
    password: currentPasswordSchema,
  })
  .meta({ id: 'LogInBody' });
export type LogInBody = z.input<typeof logInBodySchema>;
