import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import type { ApiRequest } from '../core/http/api-request.js';
import { clearedSessionCookie, readSessionToken, sessionCookie } from './session-cookie.js';
import type { IssuedSession } from './session.service.js';

/** Reads and writes the session cookie with the name and `Secure` flag `COOKIE_SECURE` picks. */
@Injectable()
export class SessionCookies {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  read(request: ApiRequest): string | null {
    return readSessionToken(request.headers, this.env.COOKIE_SECURE);
  }

  set(response: Response, session: IssuedSession): void {
    response.append(
      'Set-Cookie',
      sessionCookie(
        session.token,
        session.absoluteExpiresAt,
        this.clock.now(),
        this.env.COOKIE_SECURE,
      ),
    );
  }

  clear(response: Response): void {
    response.append('Set-Cookie', clearedSessionCookie(this.env.COOKIE_SECURE));
  }
}
