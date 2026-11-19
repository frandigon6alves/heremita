import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../core/clock/clock.js';

/** Failed logins allowed per e-mail within one window; the next attempt answers 429. */
export const LOGIN_FAILURES_ALLOWED = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Above this many tracked e-mails, finished windows are swept on the next failure. */
const SWEEP_THRESHOLD = 1_000;

interface Window {
  startedAt: number;
  failures: number;
}

/**
 * Failed logins per normalised e-mail, in fixed 15-minute windows that start
 * at the first failure. Never locks an account: once the window ends the
 * right password works again. Unknown e-mails are counted like real ones, so
 * the 429 reveals nothing either. Kept in process memory, like the throttler
 * state (see the SHORTCUT in `core/core.module.ts`).
 *
 * An attempt counts as a failure from the moment it is let through until
 * {@link recordSuccess} clears it: guesses sent all at once must not each see
 * the count from before any of them was checked.
 */
@Injectable()
export class LoginAttempts {
  private readonly windows = new Map<string, Window>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** Seconds until `email` may try again, or `null` when it may try now. */
  retryAfterSeconds(email: string): number | null {
    const window = this.openWindow(email);
    if (!window || window.failures < LOGIN_FAILURES_ALLOWED) {
      return null;
    }
    const remaining = window.startedAt + LOGIN_WINDOW_MS - this.clock.now().getTime();
    return Math.max(1, Math.ceil(remaining / 1000));
  }

  /**
   * Lets one login attempt through, counted as a failure until it succeeds,
   * or answers the seconds to wait when `email` used up its window.
   */
  begin(email: string): number | null {
    const retryAfter = this.retryAfterSeconds(email);
    if (retryAfter === null) {
      this.recordFailure(email);
    }
    return retryAfter;
  }

  private recordFailure(email: string): void {
    if (this.windows.size > SWEEP_THRESHOLD) {
      this.sweep();
    }
    const window = this.openWindow(email);
    if (window) {
      window.failures += 1;
    } else {
      this.windows.set(email, { startedAt: this.clock.now().getTime(), failures: 1 });
    }
  }

  recordSuccess(email: string): void {
    this.windows.delete(email);
  }

  private isOpen(window: Window): boolean {
    return this.clock.now().getTime() < window.startedAt + LOGIN_WINDOW_MS;
  }

  private openWindow(email: string): Window | undefined {
    const window = this.windows.get(email);
    if (window && !this.isOpen(window)) {
      this.windows.delete(email);
      return undefined;
    }
    return window;
  }

  private sweep(): void {
    for (const [email, window] of Array.from(this.windows)) {
      if (!this.isOpen(window)) {
        this.windows.delete(email);
      }
    }
  }
}
