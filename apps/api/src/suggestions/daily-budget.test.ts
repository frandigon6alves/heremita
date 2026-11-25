import { describe, expect, it } from 'vitest';
import { FixedClock } from '../core/clock/fixed-clock.js';
import { DailyBudget } from './daily-budget.js';

describe('DailyBudget', () => {
  it('allows_limit_calls_a_day_then_answers_the_seconds_to_utc_midnight', () => {
    const clock = new FixedClock('2026-11-24T23:59:00.000Z');
    const budget = new DailyBudget(2, clock);

    expect(budget.take()).toEqual({ ok: true });
    expect(budget.take()).toEqual({ ok: true });
    expect(budget.take()).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it('starts_again_on_the_next_utc_day', () => {
    const clock = new FixedClock('2026-11-24T12:00:00.000Z');
    const budget = new DailyBudget(1, clock);
    budget.take();

    clock.set('2026-11-25T00:00:00.000Z');

    expect(budget.take()).toEqual({ ok: true });
  });

  it('allows_nothing_with_a_limit_of_zero', () => {
    const budget = new DailyBudget(0, new FixedClock('2026-11-24T00:00:00.000Z'));

    expect(budget.take()).toEqual({ ok: false, retryAfterSeconds: 24 * 60 * 60 });
  });
});
