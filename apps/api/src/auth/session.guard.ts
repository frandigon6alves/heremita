import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiProblem } from '../core/http/api-problem.js';
import type { ApiRequest } from '../core/http/api-request.js';
import { unauthenticated } from '../core/http/problems.js';
import { endpointOf } from '../core/http/endpoint.decorator.js';
import { SessionCookies } from './session-cookies.js';
import { SessionService } from './session.service.js';

/**
 * Second global guard (after CSRF): puts the caller on `req.user` and enforces
 * the endpoint's `auth`. Endpoints with `auth: 'none'` never touch the session
 * table, so health checks and sign-up/login work without a database round trip.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly cookies: SessionCookies,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const def = endpointOf(this.reflector, context);
    if (!def || def.auth === 'none') {
      return true;
    }
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const token = this.cookies.read(request);
    const user = token ? await this.sessions.authenticate(token) : null;
    if (user) {
      request.user = user;
    }

    if (def.auth === 'optional') {
      return true;
    }
    if (!user) {
      throw unauthenticated();
    }
    if (def.auth === 'moderator' && user.role !== 'moderator') {
      throw new ApiProblem('forbidden', 'Only moderators may do this.');
    }
    return true;
  }
}
