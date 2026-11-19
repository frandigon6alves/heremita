import { Inject, Injectable } from '@nestjs/common';
import type { EndpointInput, endpoints, Me } from '@heremita/shared';
import { ME_SELECT, toDbLocale, toMe } from '../auth/me.mapper.js';
import { SessionService, type IssuedSession } from '../auth/session.service.js';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { ApiProblem } from '../core/http/api-problem.js';
import type { SessionUser } from '../core/http/api-request.js';
import {
  assertUncommonPassword,
  hashPassword,
  verifyPassword,
} from '../core/password/passwords.js';
import { PrismaService } from '../prisma/prisma.service.js';

type UpdateMeBody = EndpointInput<typeof endpoints.updateMe>['body'];
type ChangePasswordBody = EndpointInput<typeof endpoints.changePassword>['body'];
type DeleteAccountBody = EndpointInput<typeof endpoints.deleteAccount>['body'];

const NEW_PASSWORD_POINTER = '/body/newPassword';

function unauthenticated(): ApiProblem {
  return new ApiProblem('unauthenticated', 'Sign in to continue.');
}

function wrongPassword(pointer: string): ApiProblem {
  return new ApiProblem('wrong_password', 'The password is wrong.', {
    errors: [{ pointer, detail: 'The password is wrong.' }],
  });
}

/** The e-mail address and its local part are the first guesses of anyone who knows the address. */
function assertNotEmailDerived(password: string, email: string): void {
  const candidate = password.toLowerCase();
  const localPart = email.slice(0, email.lastIndexOf('@'));
  if (candidate === email || candidate === localPart) {
    throw new ApiProblem('validation_failed', 'The request has invalid fields.', {
      errors: [
        { pointer: NEW_PASSWORD_POINTER, detail: 'Password must not be the e-mail address' },
      ],
    });
  }
}

/** The caller's own account: profile, password and deletion (E9–E11). */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** E9. A user deleted since the guard read the session answers 401, like any dead session. */
  async update(userId: string, body: UpdateMeBody): Promise<Me> {
    const [user] = await this.prisma.user.updateManyAndReturn({
      where: { id: userId },
      data: {
        displayName: body.displayName,
        locale: body.locale === undefined ? undefined : toDbLocale(body.locale),
        theme: body.theme,
      },
      select: ME_SELECT,
    });
    if (!user) {
      throw unauthenticated();
    }
    return toMe(user);
  }

  /**
   * E10. Rotates the caller's session (the old cookie dies) and deletes every
   * other session of the user, so a thief holding another cookie is locked out.
   */
  async changePassword(caller: SessionUser, body: ChangePasswordBody): Promise<IssuedSession> {
    const user = await this.passwordHolder(caller.id);
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw wrongPassword('/body/currentPassword');
    }
    assertUncommonPassword(body.newPassword, NEW_PASSWORD_POINTER);
    assertNotEmailDerived(body.newPassword, user.email);

    const passwordHash = await hashPassword(body.newPassword);
    await this.prisma.user.update({
      where: { id: caller.id },
      data: { passwordHash, passwordChangedAt: this.clock.now() },
    });
    await this.sessions.deleteOthersOf(caller.id, caller.sessionId);
    return this.sessions.rotate(caller.sessionId);
  }

  /**
   * E11. One statement: foreign keys cascade to sessions, trips (with their
   * days, stops, trip places and custom places), reviews, blocks and reports on
   * the user's content; reports the user filed and copies of their trips stay.
   */
  async deleteAccount(userId: string, body: DeleteAccountBody): Promise<void> {
    const user = await this.passwordHolder(userId);
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      throw wrongPassword('/body/password');
    }
    await this.prisma.user.deleteMany({ where: { id: userId } });
  }

  private async passwordHolder(userId: string): Promise<{ email: string; passwordHash: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    if (!user) {
      throw unauthenticated();
    }
    return user;
  }
}
