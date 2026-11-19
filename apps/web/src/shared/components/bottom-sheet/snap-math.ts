export type Snap = 'peek' | 'half' | 'full';

export type SnapHeights = Record<Snap, number>;

/** Which way the handle button cycles next: peek → half → full → half → peek. */
export type CycleDirection = 'up' | 'down';

/** Faster than this (px/ms) on release, the sheet goes to the next snap in the fling direction. */
export const FLING_VELOCITY = 0.5;

/** Only the pointer samples this recent count towards the release velocity. */
const VELOCITY_WINDOW_MS = 100;

const SNAPS_LOW_TO_HIGH: readonly Snap[] = ['peek', 'half', 'full'];

export interface SnapLayout {
  viewportHeight: number;
  /** The sheet's CSS `min-height` in px: peek token + bottom safe area. */
  minHeight: number;
  /** The sheet's CSS `max-height` in px: viewport − app bar (+ top safe area) − gap. */
  maxHeight: number;
}

/**
 * Heights in px: peek = the CSS minimum, half = half the viewport, full = the
 * CSS maximum. Each is at least the one below, so a short landscape phone
 * never inverts them.
 */
export function snapHeights({ viewportHeight, minHeight, maxHeight }: SnapLayout): SnapHeights {
  const half = Math.max(viewportHeight / 2, minHeight);
  return { peek: minHeight, half, full: Math.max(maxHeight, half) };
}

export function clampHeight(height: number, heights: SnapHeights): number {
  return Math.min(Math.max(height, heights.peek), heights.full);
}

export function nearestSnap(height: number, heights: SnapHeights): Snap {
  let nearest: Snap = 'peek';
  for (const snap of SNAPS_LOW_TO_HIGH) {
    if (Math.abs(heights[snap] - height) < Math.abs(heights[nearest] - height)) {
      nearest = snap;
    }
  }
  return nearest;
}

/**
 * Where a released drag lands. `velocity` is px/ms, positive while the sheet
 * grows. A fling goes to the next snap past the current height in its
 * direction (or stays at the last one); a slow release goes to the nearest.
 */
export function releaseSnap(height: number, velocity: number, heights: SnapHeights): Snap {
  if (Math.abs(velocity) <= FLING_VELOCITY) {
    return nearestSnap(height, heights);
  }
  if (velocity > 0) {
    return SNAPS_LOW_TO_HIGH.find((snap) => heights[snap] > height) ?? 'full';
  }
  return SNAPS_LOW_TO_HIGH.findLast((snap) => heights[snap] < height) ?? 'peek';
}

/** The handle button's next snap: peek → half → full → half → peek, bouncing at the ends. */
export function cycleSnap(
  current: Snap,
  direction: CycleDirection,
): { snap: Snap; direction: CycleDirection } {
  if (current === 'peek') {
    return { snap: 'half', direction: 'up' };
  }
  if (current === 'full') {
    return { snap: 'half', direction: 'down' };
  }
  return direction === 'up'
    ? { snap: 'full', direction: 'up' }
    : { snap: 'peek', direction: 'down' };
}

export interface PointerSample {
  /** Sheet height at that moment, px. */
  height: number;
  /** Event time, ms. */
  time: number;
}

/** Growth speed in px/ms over the last 100 ms of samples (0 when it cannot tell). */
export function releaseVelocity(samples: readonly PointerSample[]): number {
  const last = samples.at(-1);
  if (last === undefined) {
    return 0;
  }
  const first = samples.find((sample) => last.time - sample.time <= VELOCITY_WINDOW_MS) ?? last;
  const elapsed = last.time - first.time;
  return elapsed > 0 ? (last.height - first.height) / elapsed : 0;
}
