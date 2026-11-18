import { describe, expect, it } from 'vitest';
import { FixedClock } from './fixed-clock.js';

describe('FixedClock', () => {
  it('stays_put_until_advanced', () => {
    const clock = new FixedClock('2026-11-18T10:00:00.000Z');

    clock.advance(90_000);

    expect(clock.now().toISOString()).toBe('2026-11-18T10:01:30.000Z');
  });

  it('hands_out_copies_that_callers_cannot_mutate', () => {
    const clock = new FixedClock('2026-11-18T10:00:00.000Z');

    clock.now().setUTCFullYear(2000);

    expect(clock.now().toISOString()).toBe('2026-11-18T10:00:00.000Z');
  });

  it('can_be_set_to_another_time', () => {
    const clock = new FixedClock('2026-11-18T10:00:00.000Z');

    clock.set('2027-01-01T00:00:00.000Z');

    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
