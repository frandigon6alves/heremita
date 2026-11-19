import { Injectable } from '@nestjs/common';
import type { EndpointInput, endpoints, Me } from '@heremita/shared';
import { ApiProblem } from '../core/http/api-problem.js';
import { unauthenticated } from '../core/http/problems.js';
import {
  assertUncommonPassword,
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../core/password/passwords.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginAttempts } from './login-attempts.js';
import { ME_SELECT, toDbLocale, toMe } from './me.mapper.js';
import { SessionService, type IssuedSession } from './session.service.js';

type SignUpBody = EndpointInput<typeof endpoints.signUp>['body'];
type LogInBody = EndpointInput<typeof endpoints.logIn>['body'];

/** A signed-in result: the caller's profile and the session to put in the cookie. */
export interface SignedIn {
  me: Me;
  session: IssuedSession;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly loginAttempts: LoginAttempts,
  ) {}

  /** E4. A taken e-mail fails the unique index, which the problem filter answers as 409 `email_taken`. */
  async signUp(body: SignUpBody): Promise<SignedIn> {
    assertUncommonPassword(body.password, '/body/password');
    const passwordHash = await hashPassword(body.password);
    const { token, data } = this.sessions.newSessionData();
    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        locale: toDbLocale(body.locale),
        sessions: { create: data },
      },
      select: ME_SELECT,
    });
    return { me: toMe(user), session: { token, absoluteExpiresAt: data.absoluteExpiresAt } };
  }

  /**
   * E5. Unknown e-mail and wrong password take the same time and answer the
   * same body. Failures are counted per e-mail (the schema already trimmed and
   * lower-cased it) and client address block, each from before its password
   * is checked; the attempt after the fifth in a window answers 429, as does
   * any attempt once the e-mail's backstop of 50 is used up ({@link LoginAttempts}).
   */
  async logIn(body: LogInBody, clientAddress: string): Promise<SignedIn> {
    const retryAfter = this.loginAttempts.begin(body.email, clientAddress);
    if (retryAfter !== null) {
      throw new ApiProblem(
        'too_many_attempts',
        'Too many failed sign-in attempts for this e-mail. Try again later.',
        {},
        retryAfter,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
      select: { ...ME_SELECT, passwordHash: true },
    });
    const valid = user
      ? await verifyPassword(user.passwordHash, body.password)
      : await verifyAgainstDummy(body.password);
    if (!user || !valid) {
      throw new ApiProblem('invalid_credentials', 'The e-mail or password is wrong.');
    }

    this.loginAttempts.recordSuccess(body.email, clientAddress);
    return { me: toMe(user), session: await this.sessions.create(user.id) };
  }

  /** E8. The session guard just read this user, so a missing row is a race with account deletion. */
  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: ME_SELECT });
    if (!user) {
      throw unauthenticated();
    }
    return toMe(user);
  }
}
