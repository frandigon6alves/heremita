import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ApiRequest } from './api-request.js';

/**
 * Throttles per signed-in user, or per client address when anonymous. `req.ip`
 * honours only the proxies named by `TRUST_PROXY`, so a client-sent
 * `X-Forwarded-For` cannot pick its own bucket. Runs after the session guard.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const { user } = req as unknown as ApiRequest;
    return user ? `user:${user.id}` : `ip:${await super.getTracker(req)}`;
  }
}
