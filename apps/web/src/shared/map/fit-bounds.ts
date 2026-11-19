import type { Map as MapLibreMap } from 'maplibre-gl';
import { boundsOf, type LngLat } from './geo';
import { cameraDuration } from './motion';

/** Added to the map's persistent padding (the sheet), so pins never touch the edge. */
export const FIT_PADDING_PX = 24;
export const FIT_MAX_ZOOM = 16;
const FIT_DURATION_MS = 600;

/** Frames every point inside the visible part of the map; nothing to frame leaves the camera alone. */
export function fitToPoints(map: MapLibreMap, points: readonly LngLat[]): void {
  const bounds = boundsOf(points);
  if (!bounds) {
    return;
  }
  map.fitBounds(bounds, {
    padding: FIT_PADDING_PX,
    maxZoom: FIT_MAX_ZOOM,
    duration: cameraDuration(FIT_DURATION_MS),
  });
}
