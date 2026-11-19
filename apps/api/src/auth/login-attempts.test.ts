import { describe, expect, it } from 'vitest';
import { FixedClock } from '../core/clock/fixed-clock.js';
import {
  addressBlock,
  LOGIN_EMAIL_FAILURES_ALLOWED,
  LOGIN_FAILURES_ALLOWED,
  LOGIN_WINDOW_MS,
  LoginAttempts,
} from './login-attempts.js';

const EMAIL = 'ana@example.com';
const IP = '203.0.113.7';

function setup() {
  const clock = new FixedClock('2026-11-18T10:00:00.000Z');
  return { clock, attempts: new LoginAttempts(clock) };
}

function fail(attempts: LoginAttempts, times: number, email = EMAIL, ip = IP): void {
  for (let i = 0; i < times; i += 1) {
    attempts.begin(email, ip);
  }
}

describe('addressBlock', () => {
  it.each([
    ['203.0.113.7', '203.0.113.0/24'],
    ['::ffff:203.0.113.7', '203.0.113.0/24'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::9', '2001:db8:1:2::/64'],
    ['', ''],
  ])('puts_%s_in_%s', (address, block) => {
    expect(addressBlock(address)).toBe(block);
  });
});

describe('LoginAttempts', () => {
  it('allows_attempts_up_to_the_fifth_failure', () => {
    const { attempts } = setup();

    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBeNull();
  });

  it('refuses_the_sixth_attempt_while_the_first_five_are_still_being_checked', () => {
    const { attempts } = setup();
    const started = Array.from({ length: LOGIN_FAILURES_ALLOWED }, () => attempts.begin(EMAIL, IP));

    expect(started).toEqual(Array.from({ length: LOGIN_FAILURES_ALLOWED }, () => null));
    expect(attempts.begin(EMAIL, IP)).toBe(LOGIN_WINDOW_MS / 1000);
  });

  it('blocks_after_five_failures_until_the_window_ends', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED);

    clock.advance(60_000);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBe(LOGIN_WINDOW_MS / 1000 - 60);
  });

  it('rounds_retry_after_up_to_at_least_one_second', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED);

    clock.advance(LOGIN_WINDOW_MS - 1);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBe(1);
  });

  it('lets_the_email_try_again_once_the_window_ends', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED);

    clock.advance(LOGIN_WINDOW_MS);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBeNull();
  });

  it('starts_a_fresh_window_after_the_old_one_ends', () => {
    const { clock, attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);
    clock.advance(LOGIN_WINDOW_MS);

    fail(attempts, 1);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBeNull();
  });

  it('forgets_failures_after_a_success', () => {
    const { attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);

    attempts.recordSuccess(EMAIL, IP);
    fail(attempts, LOGIN_FAILURES_ALLOWED - 1);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBeNull();
  });

  it('counts_each_email_separately', () => {
    const { attempts } = setup();

    fail(attempts, LOGIN_FAILURES_ALLOWED, 'other@example.com');

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBeNull();
    expect(attempts.retryAfterSeconds('other@example.com', IP)).not.toBeNull();
  });

  it('lets_the_email_in_from_another_block_while_one_block_is_locked', () => {
    const { attempts } = setup();
    fail(attempts, LOGIN_FAILURES_ALLOWED);

    expect(attempts.retryAfterSeconds(EMAIL, '203.0.113.200')).not.toBeNull();
    expect(attempts.retryAfterSeconds(EMAIL, '198.51.100.7')).toBeNull();
    expect(attempts.begin(EMAIL, '198.51.100.7')).toBeNull();
  });

  it('shares_one_count_across_an_ipv6_64', () => {
    const { attempts } = setup();
    for (let i = 0; i < LOGIN_FAILURES_ALLOWED; i += 1) {
      attempts.begin(EMAIL, `2001:db8:1:2::${i + 1}`);
    }

    expect(attempts.retryAfterSeconds(EMAIL, '2001:db8:1:2:ffff::1')).not.toBeNull();
    expect(attempts.retryAfterSeconds(EMAIL, '2001:db8:1:3::1')).toBeNull();
  });

  it('locks_the_email_everywhere_once_failures_from_many_blocks_reach_the_backstop', () => {
    const { attempts } = setup();
    for (let i = 0; i < LOGIN_EMAIL_FAILURES_ALLOWED; i += 1) {
      expect(attempts.begin(EMAIL, `198.18.${i}.1`)).toBeNull();
    }

    expect(attempts.begin(EMAIL, '203.0.113.7')).toBe(LOGIN_WINDOW_MS / 1000);
  });

  it('takes_only_its_own_attempt_back_from_the_backstop_on_success', () => {
    const { attempts } = setup();
    for (let i = 0; i < LOGIN_EMAIL_FAILURES_ALLOWED - 1; i += 1) {
      attempts.begin(EMAIL, `198.18.${i}.1`);
    }
    attempts.begin(EMAIL, IP);

    attempts.recordSuccess(EMAIL, IP);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBeNull();
    attempts.begin(EMAIL, IP);
    expect(attempts.retryAfterSeconds(EMAIL, IP)).not.toBeNull();
  });

  it('keeps_counting_open_windows_when_sweeping_finished_ones', () => {
    const { clock, attempts } = setup();
    for (let i = 0; i < 1_001; i += 1) {
      attempts.begin(`old-${i}@example.com`, IP);
    }
    clock.advance(LOGIN_WINDOW_MS / 2);
    fail(attempts, LOGIN_FAILURES_ALLOWED);
    clock.advance(LOGIN_WINDOW_MS / 2);

    attempts.begin('new@example.com', IP);

    expect(attempts.retryAfterSeconds(EMAIL, IP)).toBe(LOGIN_WINDOW_MS / 2 / 1000);
    expect(attempts.retryAfterSeconds('old-0@example.com', IP)).toBeNull();
  });
});
