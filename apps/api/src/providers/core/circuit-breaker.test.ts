import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../core/clock/fixed-clock.js';
import { CircuitBreaker } from './circuit-breaker.js';

const CONFIG = { failureThreshold: 5, openMs: 30_000 };

function failTimes(breaker: CircuitBreaker, times: number): void {
  for (let i = 0; i < times; i += 1) {
    breaker.recordFailure();
  }
}

describe('CircuitBreaker', () => {
  it('stays_closed_below_five_consecutive_failures', () => {
    const breaker = new CircuitBreaker(CONFIG, new FixedClock('2026-11-18T10:00:00.000Z'));

    failTimes(breaker, 4);

    expect(breaker.state).toBe('closed');
    expect(breaker.tryPass()).toBe(true);
  });

  it('opens_after_five_consecutive_failures', () => {
    const breaker = new CircuitBreaker(CONFIG, new FixedClock('2026-11-18T10:00:00.000Z'));

    failTimes(breaker, 5);

    expect(breaker.state).toBe('open');
    expect(breaker.tryPass()).toBe(false);
    expect(breaker.remainingOpenMs()).toBe(30_000);
  });

  it('forgets_failures_when_the_host_answers', () => {
    const breaker = new CircuitBreaker(CONFIG, new FixedClock('2026-11-18T10:00:00.000Z'));
    failTimes(breaker, 4);

    breaker.recordAnswer();
    failTimes(breaker, 4);

    expect(breaker.state).toBe('closed');
  });

  it('lets_exactly_one_probe_through_after_30_s', () => {
    const clock = new FixedClock('2026-11-18T10:00:00.000Z');
    const breaker = new CircuitBreaker(CONFIG, clock);
    failTimes(breaker, 5);

    clock.advance(29_999);
    const beforeExpiry = breaker.tryPass();
    clock.advance(1);

    expect(beforeExpiry).toBe(false);
    expect(breaker.state).toBe('half-open');
    expect(breaker.tryPass()).toBe(true);
    expect(breaker.tryPass()).toBe(false);
  });

  it('closes_when_the_probe_succeeds', () => {
    const clock = new FixedClock('2026-11-18T10:00:00.000Z');
    const breaker = new CircuitBreaker(CONFIG, clock);
    failTimes(breaker, 5);
    clock.advance(30_000);
    breaker.tryPass();

    breaker.recordAnswer();

    expect(breaker.state).toBe('closed');
  });

  it('opens_for_another_30_s_when_the_probe_fails', () => {
    const clock = new FixedClock('2026-11-18T10:00:00.000Z');
    const breaker = new CircuitBreaker(CONFIG, clock);
    failTimes(breaker, 5);
    clock.advance(30_000);
    breaker.tryPass();

    breaker.recordFailure();

    expect(breaker.state).toBe('open');
    expect(breaker.remainingOpenMs()).toBe(30_000);
  });

  it('lets_another_probe_through_when_one_is_abandoned', () => {
    const clock = new FixedClock('2026-11-18T10:00:00.000Z');
    const breaker = new CircuitBreaker(CONFIG, clock);
    failTimes(breaker, 5);
    clock.advance(30_000);
    breaker.tryPass();

    breaker.abandonProbe();

    expect(breaker.tryPass()).toBe(true);
  });
});
