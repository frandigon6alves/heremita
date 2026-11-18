import { describe, expect, it } from 'vitest';
import { FixedClock } from '../core/clock/fixed-clock.js';
import { LOGIN_FAILURES_ALLOWED, LOGIN_WINDOW_MS, LoginAttempts } from './login-attempts.js';

const EMAIL = 'ana@example.com';

function setup() {
  const clock = new FixedClock('2026-11-18T10:00:00.000Z');
  return { clock, attempts: new LoginAttempts(clock) };
}

function fail(attempts: LoginAttempts, times: number, email = EMAIL): void {
  for (let i = 0; i < times; i += 1) {
    attempts.recordFailure(email);
  }
}

describe('LoginAttempts', () => {
  it('allows_attempts_up_to_the_fifth_failure', () => {
    const { attempts } = setup();

    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);

    expect(attempts.retryAfterSeconds(EMAIL)).toBeNull();
  });

  it('blocks_after_five_failures_until_the_window_ends', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED);

    clock.advance(60_000);

    expect(attempts.retryAfterSeconds(EMAIL)).toBe(LOGIN_WINDOW_MS / 1000 - 60);
  });

  it('rounds_retry_after_up_to_at_least_one_second', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED);

    clock.advance(LOGIN_WINDOW_MS - 1);

    expect(attempts.retryAfterSeconds(EMAIL)).toBe(1);
  });

  it('lets_the_email_try_again_once_the_window_ends', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED);

    clock.advance(LOGIN_WINDOW_MS);

    expect(attempts.retryAfterSeconds(EMAIL)).toBeNull();
  });

  it('starts_a_fresh_window_after_the_old_one_ends', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);
    clock.advance(LOGIN_WINDOW_MS);

    fail(attempts, 1);

    expect(attempts.retryAfterSeconds(EMAIL)).toBeNull();
  });

  it('forgets_failures_after_a_success', () => {
    const { attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);

    attempts.recordSuccess(EMAIL);
    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);

    expect(attempts.retryAfterSeconds(EMAIL)).toBeNull();
  });

  it('counts_each_email_separately', () => {
    const { attempts } = setup();

    fail(attempts, LOGIN_FAILURES_ALLOWED, 'other@example.com');

    expect(attempts.retryAfterSeconds(EMAIL)).toBeNull();
    expect(attempts.retryAfterSeconds('other@example.com')).not.toBeNull();
  });

  it('keeps_counting_open_windows_when_sweeping_finished_ones', () => {
    const { clock, attempts } = setup();
    for (let i = 0; i < 1_001; i += 1) {
      attempts.recordFailure(`old-${i}@example.com`);
    }
    clock.advance(LOGIN_WINDOW_MS / 2);
    fail(attempts, LOGIN_FAILURES_ALLOWED);
    clock.advance(LOGIN_WINDOW_MS / 2);

    attempts.recordFailure('new@example.com');

    expect(attempts.retryAfterSeconds(EMAIL)).toBe(LOGIN_WINDOW_MS / 2 / 1000);
    expect(attempts.retryAfterSeconds('old-0@example.com')).toBeNull();
  });
});
