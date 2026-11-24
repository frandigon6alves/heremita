'use client';

import { useEffect } from 'react';
import { isMapAlive, useMap } from './map-context';
import { cameraDuration } from './motion';

const PADDING_EASE_MS = 200;

export interface MapPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

type Edges = Required<MapPadding>;

/** MapLibre reports its padding with optional sides; a missing side is zero. */
const edgesOf = (padding: MapPadding): Edges => ({
  top: padding.top ?? 0,
  right: padding.right ?? 0,
  bottom: padding.bottom ?? 0,
  left: padding.left ?? 0,
});

const same = (a: Edges, b: Edges) =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

const NONE: Edges = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Keeps the map's persistent padding (the part a sheet or panel covers) so
 * centring and `fitBounds` land in the visible area. Call it with the settled
 * size, not on every drag frame; the map is never resized for it.
 *
 * The first padding (a map that has none yet) is set at once, before the
 * day's `fitBounds` that mounts after it: every camera call stops the one
 * running, so an eased padding there would cut the fit short and leave stops
 * under the sheet. A later change eases, and waits for a camera move in
 * progress (a fit, a focus) to end first instead of cutting it short.
 */
export function useMapPadding({ top = 0, right = 0, bottom = 0, left = 0 }: MapPadding): void {
  const { map } = useMap();

  useEffect(() => {
    const padding: Edges = { top, right, bottom, left };
    const current = edgesOf(map.getPadding());
    if (same(current, padding)) {
      return;
    }
    const ease = () => {
      if (isMapAlive(map)) {
        map.easeTo({ padding, duration: cameraDuration(PADDING_EASE_MS) });
      }
    };
    if (map.isMoving()) {
      map.once('moveend', ease);
      return () => {
        map.off('moveend', ease);
      };
    }
    if (same(current, NONE)) {
      map.jumpTo({ padding });
      return;
    }
    ease();
  }, [map, top, right, bottom, left]);
}
