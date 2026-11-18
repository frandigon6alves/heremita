import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { ApiProblem } from './api-problem.js';
import { csrfVerdict } from './csrf.js';

/** First guard of every route: rejects cross-site unsafe requests and non-JSON bodies. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const verdict = csrfVerdict(request.method, request.headers, this.env.WEB_ORIGIN);
    if (verdict === 'cross_site') {
      throw new ApiProblem('csrf_rejected', 'Cross-site requests are not accepted.');
    }
    if (verdict === 'not_json') {
      throw new ApiProblem('unsupported_media_type', 'Request bodies must be application/json.');
    }
    return true;
  }
}
