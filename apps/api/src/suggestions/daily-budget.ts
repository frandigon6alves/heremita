import type { Clock } from '../core/clock/clock.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BudgetDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * E52 calls allowed per UTC day across the whole API (V80): the cost cap of
 * the model calls, on top of the per-user `ai` throttle.
 */
// SHORTCUT(owner): the daily AI budget lives in API process memory — ceiling: one API instance, a restart resets the day's count; upgrade: a second API instance or a paid AI plan
export class DailyBudget {
  private day = -1;
  private used = 0;

  constructor(
    private readonly limit: number,
    private readonly clock: Clock,
  ) {}

  /** Counts one call, or says how long until the next UTC day when the day's budget is spent. */
  take(): BudgetDecision {
    const now = this.clock.now().getTime();
    const day = Math.floor(now / DAY_MS);
    if (day !== this.day) {
      this.day = day;
      this.used = 0;
    }
    if (this.used >= this.limit) {
      return { ok: false, retryAfterSeconds: Math.ceil(((day + 1) * DAY_MS - now) / 1000) };
    }
    this.used += 1;
    return { ok: true };
  }
}
