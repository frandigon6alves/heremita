import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { CLOCK, type Clock } from '../clock/clock.js';

/**
 * Headers the web app's server renders (`apps/web/src/lib/api/server.ts`) add:
 * the address of the browser that asked for the page, and
 * `<unix ms>.<hex HMAC-SHA256>` over it with `SERVER_FETCH_SECRET`. Kept in
 * step with that file by hand.
 */
export const CLIENT_IP_HEADER = 'x-heremita-client-ip';
export const CLIENT_IP_SIGNATURE_HEADER = 'x-heremita-client-ip-signature';

/** A signature older (or newer, clock skew) than this is ignored. */
export const CLIENT_IP_SIGNATURE_MAX_AGE_MS = 60_000;

const SIGNATURE_PATTERN = /^(\d{1,15})\.([0-9a-f]{64})$/;

function mac(secret: string, ip: string, timestampMs: number): Buffer {
  return createHmac('sha256', secret)
    .update(`heremita-client-ip:v1\n${ip}\n${timestampMs}`)
    .digest();
}

/** The signature header value for `ip` at `timestampMs` (what the web app sends). */
export function signClientIp(secret: string, ip: string, timestampMs: number): string {
  return `${timestampMs}.${mac(secret, ip, timestampMs).toString('hex')}`;
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

interface AddressedRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The address rate limits and login attempts key on: the browser's address
 * when a server render of the web app vouches for it with a valid, fresh
 * signature, else `req.ip` (which honours only the `TRUST_PROXY` hops).
 * Without `SERVER_FETCH_SECRET` the headers are never trusted.
 */
@Injectable()
export class ClientAddress {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  of(request: AddressedRequest): string {
    return this.signedIp(request) ?? request.ip ?? '';
  }

  private signedIp(request: AddressedRequest): string | null {
    const secret = this.env.SERVER_FETCH_SECRET;
    const ip = single(request.headers[CLIENT_IP_HEADER]);
    const signature = single(request.headers[CLIENT_IP_SIGNATURE_HEADER]);
    if (secret === null || ip === undefined || signature === undefined || isIP(ip) === 0) {
      return null;
    }
    const match = SIGNATURE_PATTERN.exec(signature);
    if (!match) {
      return null;
    }
    const timestampMs = Number(match[1]);
    const age = Math.abs(this.clock.now().getTime() - timestampMs);
    if (age > CLIENT_IP_SIGNATURE_MAX_AGE_MS) {
      return null;
    }
    const sent = Buffer.from(match[2] ?? '', 'hex');
    const expected = mac(secret, ip, timestampMs);
    return sent.length === expected.length && timingSafeEqual(sent, expected) ? ip : null;
  }
}
