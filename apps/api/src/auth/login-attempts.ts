import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { normalizeIp } from '@nestjs/throttler';
import { CLOCK, type Clock } from '../core/clock/clock.js';

/** Failed logins allowed per e-mail from one address block within a window; the next answers 429. */
export const LOGIN_FAILURES_ALLOWED = 5;
/** Failed logins allowed per e-mail from all addresses together: the backstop against rotation. */
export const LOGIN_EMAIL_FAILURES_ALLOWED = 50;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Above this many tracked keys, finished windows are swept on the next failure. */
const SWEEP_THRESHOLD = 1_000;

interface Window {
  startedAt: number;
  failures: number;
}

/**
 * The block an address belongs to: its /24 for IPv4 (also IPv4-mapped IPv6),
 * its /64 for IPv6. Whoever holds one address of a block usually holds the
 * rest, so rotating within it buys a guesser nothing.
 */
export function addressBlock(address: string): string {
  const normalised = normalizeIp(address, 64);
  if (isIP(normalised) === 4) {
    return `${normalised.split('.').slice(0, 3).join('.')}.0/24`;
  }
  return normalised;
}

/** Fixed windows that start at the first failure, keyed by any string. */
class FailureWindows {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly clock: Clock,
    private readonly allowed: number,
  ) {}

  retryAfterSeconds(key: string): number | null {
    const window = this.open(key);
    if (!window || window.failures < this.allowed) {
      return null;
    }
    const remaining = window.startedAt + LOGIN_WINDOW_MS - this.clock.now().getTime();
    return Math.max(1, Math.ceil(remaining / 1000));
  }

  add(key: string): void {
    if (this.windows.size > SWEEP_THRESHOLD) {
      this.sweep();
    }
    const window = this.open(key);
    if (window) {
      window.failures += 1;
    } else {
      this.windows.set(key, { startedAt: this.clock.now().getTime(), failures: 1 });
    }
  }

  /** Takes back one failure counted ahead of time. */
  remove(key: string): void {
    const window = this.open(key);
    if (window) {
      window.failures = Math.max(0, window.failures - 1);
    }
  }

  clear(key: string): void {
    this.windows.delete(key);
  }

  private isOpen(window: Window): boolean {
    return this.clock.now().getTime() < window.startedAt + LOGIN_WINDOW_MS;
  }

  private open(key: string): Window | undefined {
    const window = this.windows.get(key);
    if (window && !this.isOpen(window)) {
      this.windows.delete(key);
      return undefined;
    }
    return window;
  }

  private sweep(): void {
    for (const [key, window] of Array.from(this.windows)) {
      if (!this.isOpen(window)) {
        this.windows.delete(key);
      }
    }
  }
}

/**
 * Failed logins in fixed 15-minute windows that start at the first failure,
 * counted twice: per normalised e-mail and client address block (5), and per
 * e-mail alone (50). The first limit stops a guesser; keying it on the address
 * too means a guesser cannot lock the owner out, who signs in from elsewhere.
 * The second only trips when guesses come from many blocks. Never locks an
 * account: once a window ends the right password works again. Unknown e-mails
 * are counted like real ones, so the 429 reveals nothing either. Kept in
 * process memory, like the throttler state (see the SHORTCUT in
 * `core/core.module.ts`).
 *
 * An attempt counts as a failure from the moment it is let through until
 * {@link recordSuccess} clears it: guesses sent all at once must not each see
 * the count from before any of them was checked.
 */
@Injectable()
export class LoginAttempts {
  private readonly perBlock: FailureWindows;
  private readonly perEmail: FailureWindows;

  constructor(@Inject(CLOCK) clock: Clock) {
    this.perBlock = new FailureWindows(clock, LOGIN_FAILURES_ALLOWED);
    this.perEmail = new FailureWindows(clock, LOGIN_EMAIL_FAILURES_ALLOWED);
  }

  /** Seconds until `email` may try again from `address`, or `null` when it may try now. */
  retryAfterSeconds(email: string, address: string): number | null {
    const waits = [
      this.perBlock.retryAfterSeconds(blockKey(email, address)),
      this.perEmail.retryAfterSeconds(email),
    ].filter((wait) => wait !== null);
    return waits.length === 0 ? null : Math.max(...waits);
  }

  /**
   * Lets one login attempt through, counted as a failure until it succeeds,
   * or answers the seconds to wait when `email` used up a window.
   */
  begin(email: string, address: string): number | null {
    const retryAfter = this.retryAfterSeconds(email, address);
    if (retryAfter === null) {
      this.perBlock.add(blockKey(email, address));
      this.perEmail.add(email);
    }
    return retryAfter;
  }

  /**
   * The right password from `address`: forgets that block's failures and takes
   * this attempt back from the e-mail's total (the others stay: they were not
   * the owner's).
   */
  recordSuccess(email: string, address: string): void {
    this.perBlock.clear(blockKey(email, address));
    this.perEmail.remove(email);
  }
}

function blockKey(email: string, address: string): string {
  return `${email} ${addressBlock(address)}`;
}
