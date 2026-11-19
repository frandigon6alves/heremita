import { Controller, Header, Req, Res } from '@nestjs/common';
import { API_PREFIX, endpoints, type EndpointInput, type Me } from '@heremita/shared';
import type { Request, Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { ClientAddress } from '../core/http/client-address.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { AuthService } from './auth.service.js';
import { SessionCookies } from './session-cookies.js';
import { SessionService } from './session.service.js';

/** Sign-up, login, logout and the caller's own profile (E4–E8). */
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly cookies: SessionCookies,
    private readonly clientAddress: ClientAddress,
  ) {}

  @Endpoint(endpoints.signUp)
  @Header('Location', `${API_PREFIX}/me`)
  async signUp(
    @Input() input: EndpointInput<typeof endpoints.signUp>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const { me, session } = await this.auth.signUp(input.body);
    this.cookies.set(response, session);
    return me;
  }

  @Endpoint(endpoints.logIn)
  @Header('Location', `${API_PREFIX}/sessions/current`)
  async logIn(
    @Input() input: EndpointInput<typeof endpoints.logIn>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const { me, session } = await this.auth.logIn(input.body, this.clientAddress.of(request));
    this.cookies.set(response, session);
    return me;
  }

  @Endpoint(endpoints.logOut)
  async logOut(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.delete(user.sessionId);
    this.cookies.clear(response);
  }

  @Endpoint(endpoints.logOutEverywhere)
  async logOutEverywhere(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.deleteAllOf(user.id);
    this.cookies.clear(response);
  }

  @Endpoint(endpoints.getMe)
  getMe(@CurrentUser() user: SessionUser): Promise<Me> {
    return this.auth.me(user.id);
  }
}
