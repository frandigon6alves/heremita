'use client';

import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import { useEffect, useEffectEvent } from 'react';
import type { LngLat } from './geo';
import { useMap } from './map-context';

/**
 * MapLibre turns a 500 ms touch hold into `contextmenu`, then fires `click`
 * when the finger lifts. That lift-click must not also select or deselect.
 * A right-click is a `contextmenu` with no click after it.
 */
export interface LiftClickFilter {
  touchStart(): void;
  touchEnd(remainingTouches: number): void;
  touchCancel(): void;
  contextMenu(): void;
  /** True once for the click that ends a long press. */
  consume(): boolean;
}

export function createLiftClickFilter(): LiftClickFilter {
  let touchActive = false;
  let liftClickPending = false;
  return {
    touchStart() {
      touchActive = true;
      liftClickPending = false;
    },
    touchEnd(remainingTouches) {
      if (remainingTouches === 0) {
        touchActive = false;
      }
    },
    touchCancel() {
      touchActive = false;
    },
    contextMenu() {
      liftClickPending = touchActive;
    },
    consume() {
      const pending = liftClickPending;
      liftClickPending = false;
      return pending;
    },
  };
}

const filters = new WeakMap<MapLibreMap, LiftClickFilter>();

/** Map click handlers call this first and ignore the click when it returns true. */
export function consumeLiftClick(map: MapLibreMap): boolean {
  return filters.get(map)?.consume() ?? false;
}

/** Calls `onLongPress` on a touch hold or a right-click; returns the detach function. */
export function attachLongPress(
  map: MapLibreMap,
  onLongPress: (lngLat: LngLat) => void,
): () => void {
  const filter = createLiftClickFilter();
  filters.set(map, filter);
  const onTouchStart = () => filter.touchStart();
  const onTouchEnd = (event: MapTouchEvent) => filter.touchEnd(event.points.length);
  const onTouchCancel = () => filter.touchCancel();
  const onContextMenu = (event: MapMouseEvent) => {
    filter.contextMenu();
    onLongPress([event.lngLat.lng, event.lngLat.lat]);
  };
  map.on('touchstart', onTouchStart);
  map.on('touchend', onTouchEnd);
  map.on('touchcancel', onTouchCancel);
  map.on('contextmenu', onContextMenu);
  return () => {
    map.off('touchstart', onTouchStart);
    map.off('touchend', onTouchEnd);
    map.off('touchcancel', onTouchCancel);
    map.off('contextmenu', onContextMenu);
    if (filters.get(map) === filter) {
      filters.delete(map);
    }
  };
}

/**
 * Long-press (touch) and right-click open a draft at that point. A shortcut
 * only: the page must also offer the "Add here" button and search (V55).
 */
export function LongPressHandler({ onLongPress }: { onLongPress: (lngLat: LngLat) => void }) {
  const { map } = useMap();
  const handleLongPress = useEffectEvent(onLongPress);

  useEffect(() => attachLongPress(map, (lngLat) => handleLongPress(lngLat)), [map]);

  return null;
}
