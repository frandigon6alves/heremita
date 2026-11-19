'use client';

import { useMediaQuery } from './use-media-query';

/** True when the viewer asked for less motion: animations and map camera moves take 0 ms. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
