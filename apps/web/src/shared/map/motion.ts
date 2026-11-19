const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Camera animations last `ms`, or 0 when the viewer asked for reduced motion (V59). */
export function cameraDuration(ms: number): number {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? 0 : ms;
}
