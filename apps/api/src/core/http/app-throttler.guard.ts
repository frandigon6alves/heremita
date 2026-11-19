import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { ApiRequest } from './api-request.js';
import { ClientAddress } from './client-address.js';

/**
 * Throttles per signed-in user, or per client address when anonymous. The
 * address is `req.ip` (only the proxies named by `TRUST_PROXY` may set
 * `X-Forwarded-For`, so a client cannot pick its own bucket) unless a web
 * server render vouches for the browser's address with a valid signature
 * ({@link ClientAddress}). Runs after the session guard.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly clientAddress: ClientAddress,
  ) {
    super(options, storageService, reflector);
  }

  /** Anonymous addresses go through the base tracker, which folds IPv6 into its /64. */
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as ApiRequest;
    if (request.user) {
      return `user:${request.user.id}`;
    }
    return `ip:${await super.getTracker({ ip: this.clientAddress.of(request) })}`;
  }
}
