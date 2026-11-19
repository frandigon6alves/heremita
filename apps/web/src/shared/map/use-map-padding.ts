'use client';

import { useEffect } from 'react';
import { useMap } from './map-context';
import { cameraDuration } from './motion';

const PADDING_EASE_MS = 200;

export interface MapPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/**
 * Keeps the map's persistent padding (the part a sheet or panel covers) so
 * centring and `fitBounds` land in the visible area. Call it with the settled
 * size, not on every drag frame; the map is never resized for it.
 */
export function useMapPadding({ top = 0, right = 0, bottom = 0, left = 0 }: MapPadding): void {
  const { map } = useMap();

  useEffect(() => {
    map.easeTo({
      padding: { top, right, bottom, left },
      duration: cameraDuration(PADDING_EASE_MS),
    });
  }, [map, top, right, bottom, left]);
}
