import { Controller, Res } from '@nestjs/common';
import { endpoints, type EndpointInput, type Me } from '@heremita/shared';
import type { Response } from 'express';
import { SessionCookies } from '../auth/session-cookies.js';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { MeService } from './me.service.js';

/** The caller's own account (E9–E11); E8 `GET /me` lives with sign-up and login. */
@Controller()
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly cookies: SessionCookies,
  ) {}

  @Endpoint(endpoints.updateMe)
  updateMe(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.updateMe>,
  ): Promise<Me> {
    return this.me.update(user.id, input.body);
  }

  @Endpoint(endpoints.changePassword)
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.changePassword>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.me.changePassword(user, input.body);
    this.cookies.set(response, session);
  }

  @Endpoint(endpoints.deleteAccount)
  async deleteAccount(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.deleteAccount>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.me.deleteAccount(user.id, input.body);
    this.cookies.clear(response);
  }
}
