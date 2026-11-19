'use client';

import { useEffect } from 'react';

/**
 * Loads the map code while the browser is idle, so opening a trip from this
 * page does not wait for it. Renders nothing.
 */
export function WarmMapChunk() {
  useEffect(() => {
    if (!('requestIdleCallback' in window)) {
      return;
    }
    const handle = window.requestIdleCallback(() => void import('@/shared/map/map-view'));
    return () => window.cancelIdleCallback(handle);
  }, []);

  return null;
}
