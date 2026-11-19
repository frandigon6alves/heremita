'use client';

import type { LngLat } from '@heremita/shared';
import { useEffect, useEffectEvent } from 'react';
import { useMap } from '@/shared/map/map-context';

/** Map settles before its centre is read again (search bias, "Add here" crosshair). */
export const MAP_SETTLE_MS = 400;

export interface MapCentre {
  center: LngLat;
  zoom: number;
}

interface MapCentreTrackerProps {
  /** The visible centre (padding honoured) once on mount, then 400 ms after each move ends. */
  onChange: (centre: MapCentre) => void;
  /** The viewer started dragging the map. */
  onUserPan?: () => void;
}

/** Map → planner: where the viewer is looking. Renders nothing. */
export function MapCentreTracker({ onChange, onUserPan }: MapCentreTrackerProps) {
  const { map } = useMap();
  const report = useEffectEvent(() => {
    const { lng, lat } = map.getCenter();
    onChange({ center: { lng, lat }, zoom: Math.round(map.getZoom()) });
  });
  const pan = useEffectEvent(() => onUserPan?.());

  useEffect(() => {
    report();
    let timer: number | undefined;
    const onMoveEnd = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => report(), MAP_SETTLE_MS);
    };
    const onDragStart = () => pan();
    map.on('moveend', onMoveEnd);
    map.on('dragstart', onDragStart);
    return () => {
      window.clearTimeout(timer);
      map.off('moveend', onMoveEnd);
      map.off('dragstart', onDragStart);
    };
  }, [map]);

  return null;
}
