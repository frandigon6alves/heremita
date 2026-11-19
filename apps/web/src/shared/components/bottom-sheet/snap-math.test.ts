import { describe, expect, it } from 'vitest';
import {
  clampHeight,
  cycleSnap,
  FLING_VELOCITY,
  nearestSnap,
  releaseSnap,
  releaseVelocity,
  snapHeights,
} from './snap-math';

// A 360 × 800 phone: peek 136 + 24 safe area, full = 800 − 56 − 8.
const heights = snapHeights({ viewportHeight: 800, minHeight: 160, maxHeight: 736 });

describe('snapHeights', () => {
  it('takes_peek_from_the_css_minimum_half_from_the_viewport_and_full_from_the_css_maximum', () => {
    expect(heights).toEqual({ peek: 160, half: 400, full: 736 });
  });

  it('never_lets_half_drop_below_peek_or_full_below_half_on_a_short_screen', () => {
    expect(snapHeights({ viewportHeight: 280, minHeight: 160, maxHeight: 150 })).toEqual({
      peek: 160,
      half: 160,
      full: 160,
    });
  });
});

describe('clampHeight', () => {
  it('keeps_a_drag_between_peek_and_full', () => {
    expect(clampHeight(40, heights)).toBe(160);
    expect(clampHeight(500, heights)).toBe(500);
    expect(clampHeight(900, heights)).toBe(736);
  });
});

describe('nearestSnap', () => {
  it('picks_the_closest_snap', () => {
    expect(nearestSnap(170, heights)).toBe('peek');
    expect(nearestSnap(279, heights)).toBe('peek');
    expect(nearestSnap(281, heights)).toBe('half');
    expect(nearestSnap(567, heights)).toBe('half');
    expect(nearestSnap(569, heights)).toBe('full');
  });
});

describe('releaseSnap', () => {
  it('goes_to_the_nearest_snap_on_a_slow_release', () => {
    expect(releaseSnap(420, FLING_VELOCITY, heights)).toBe('half');
    expect(releaseSnap(420, -FLING_VELOCITY, heights)).toBe('half');
  });

  it('goes_to_the_next_snap_up_on_an_upward_fling_even_when_another_is_nearer', () => {
    expect(releaseSnap(420, 0.6, heights)).toBe('full');
    expect(releaseSnap(170, 0.6, heights)).toBe('half');
  });

  it('goes_to_the_next_snap_down_on_a_downward_fling', () => {
    expect(releaseSnap(700, -0.6, heights)).toBe('half');
    expect(releaseSnap(380, -0.6, heights)).toBe('peek');
  });

  it('stays_at_the_last_snap_when_flung_past_it', () => {
    expect(releaseSnap(736, 2, heights)).toBe('full');
    expect(releaseSnap(160, -2, heights)).toBe('peek');
  });
});

describe('cycleSnap', () => {
  it('cycles_peek_half_full_half_peek', () => {
    const fromPeek = cycleSnap('peek', 'down');
    const fromHalfUp = cycleSnap(fromPeek.snap, fromPeek.direction);
    const fromFull = cycleSnap(fromHalfUp.snap, fromHalfUp.direction);
    const fromHalfDown = cycleSnap(fromFull.snap, fromFull.direction);

    expect([fromPeek.snap, fromHalfUp.snap, fromFull.snap, fromHalfDown.snap]).toEqual([
      'half',
      'full',
      'half',
      'peek',
    ]);
  });
});

describe('releaseVelocity', () => {
  it('is_zero_without_movement_to_measure', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ height: 300, time: 10 }])).toBe(0);
  });

  it('measures_growth_over_the_last_100_ms_only', () => {
    const samples = [
      { height: 200, time: 0 },
      { height: 210, time: 400 },
      { height: 250, time: 450 },
      { height: 290, time: 500 },
    ];

    expect(releaseVelocity(samples)).toBeCloseTo(80 / 100);
  });

  it('is_negative_while_the_sheet_shrinks', () => {
    expect(
      releaseVelocity([
        { height: 500, time: 0 },
        { height: 400, time: 50 },
      ]),
    ).toBe(-2);
  });
});
