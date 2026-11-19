import { randomBytes } from 'node:crypto';
import { emailSchema } from '@heremita/shared';
import type { Clock } from '../../core/clock/clock.js';
import { hashPassword } from '../../core/password/passwords.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

/** 18 random bytes → 24 base64url characters: above `PASSWORD_MIN`, never on the blocklist. */
const TEMPORARY_PASSWORD_BYTES = 18;

export class ResetPasswordError extends Error {
  override readonly name = 'ResetPasswordError';
}

export function temporaryPassword(): string {
  return randomBytes(TEMPORARY_PASSWORD_BYTES).toString('base64url');
}

/**
 * Owner-run password reset (there is no e-mail delivery): stores a new
 * password and deletes every session of the user, in one transaction. Returns
 * the password, which exists nowhere else and must be handed to the user.
 */
export async function resetPassword(
  prisma: PrismaClient,
  clock: Clock,
  rawEmail: string,
  password = temporaryPassword(),
): Promise<string> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) {
    throw new ResetPasswordError(`"${rawEmail}" is not an e-mail address.`);
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateManyAndReturn({
      where: { email: email.data },
      data: { passwordHash, passwordChangedAt: clock.now() },
      select: { id: true },
    });
    const [user] = updated;
    if (!user) {
      throw new ResetPasswordError(`No user has the e-mail ${email.data}.`);
    }
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
  return password;
}
