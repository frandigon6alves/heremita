import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../core/clock/fixed-clock.js';
import { TokenBucket } from './token-bucket.js';

const START = '2026-11-18T10:00:00.000Z';

describe('TokenBucket', () => {
  it('starts_full_and_serves_a_burst', () => {
    const bucket = new TokenBucket({ capacity: 3, intervalMs: 1_000 }, new FixedClock(START));

    expect([bucket.tryTake(), bucket.tryTake(), bucket.tryTake()]).toEqual([0, 0, 0]);
  });

  it('says_how_long_to_wait_when_empty', () => {
    const clock = new FixedClock(START);
    const bucket = new TokenBucket({ capacity: 1, intervalMs: 1_100 }, clock);
    bucket.tryTake();

    clock.advance(100);

    expect(bucket.tryTake()).toBe(1_000);
  });

  it('refills_one_token_per_interval', () => {
    const clock = new FixedClock(START);
    const bucket = new TokenBucket({ capacity: 1, intervalMs: 1_000 }, clock);
    bucket.tryTake();

    clock.advance(1_000);

    expect(bucket.tryTake()).toBe(0);
    expect(bucket.tryTake()).toBe(1_000);
  });

  it('never_holds_more_than_its_capacity', () => {
    const clock = new FixedClock(START);
    const bucket = new TokenBucket({ capacity: 3, intervalMs: 1_000 }, clock);

    clock.advance(60_000);

    expect([bucket.tryTake(), bucket.tryTake(), bucket.tryTake()]).toEqual([0, 0, 0]);
    expect(bucket.tryTake()).toBe(1_000);
  });
});
