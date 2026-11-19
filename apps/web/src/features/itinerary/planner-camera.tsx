'use client';

import type { LngLat } from '@heremita/shared';
import { useEffect, useEffectEvent } from 'react';
import { fitToPoints } from '@/shared/map/fit-bounds';
import { useMap } from '@/shared/map/map-context';
import { cameraDuration } from '@/shared/map/motion';

const FOCUS_EASE_MS = 300;
const FOCUS_MIN_ZOOM = 15;

interface PlannerCameraProps {
  /** Changes when the selected day changes: the camera frames `points` then (and on mount). */
  fitKey: string;
  points: readonly LngLat[];
  /** The selected place or search result: the camera eases to it. */
  focus: LngLat | null;
}

/** URL → map: frames the selected day, follows the selected place. Renders nothing. */
export function PlannerCamera({ fitKey, points, focus }: PlannerCameraProps) {
  const { map } = useMap();
  const frame = useEffectEvent(() =>
    fitToPoints(
      map,
      points.map((point) => [point.lng, point.lat] as const),
    ),
  );

  useEffect(() => {
    frame();
  }, [fitKey]);

  const focusLng = focus?.lng;
  const focusLat = focus?.lat;
  useEffect(() => {
    if (focusLng === undefined || focusLat === undefined) {
      return;
    }
    map.easeTo({
      center: [focusLng, focusLat],
      zoom: Math.max(map.getZoom(), FOCUS_MIN_ZOOM),
      duration: cameraDuration(FOCUS_EASE_MS),
    });
  }, [map, focusLng, focusLat]);

  return null;
}
