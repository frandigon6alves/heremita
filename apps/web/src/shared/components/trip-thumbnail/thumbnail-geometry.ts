import type { LngLat } from '@heremita/shared';

export interface Point {
  x: number;
  y: number;
}

export interface Frame {
  width: number;
  height: number;
  /** Space kept free on every side, so dots at the edge stay whole. */
  padding: number;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Projects a trip's preview points into an SVG frame: equirectangular,
 * squashed by the cosine of the mean latitude (so a city does not look
 * stretched), scaled uniformly to fit, centred. North is up. One point (or
 * all at one spot) lands in the middle.
 */
export function projectToFrame(
  points: readonly LngLat[],
  { width, height, padding }: Frame,
): Point[] {
  if (points.length === 0) {
    return [];
  }
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const squash = Math.cos(meanLat * DEGREES_TO_RADIANS);
  const flat = points.map((point) => ({ x: point.lng * squash, y: -point.lat }));

  const xs = flat.map((point) => point.x);
  const ys = flat.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const innerWidth = width - 2 * padding;
  const innerHeight = height - 2 * padding;
  const scales = [
    spanX > 0 ? innerWidth / spanX : Infinity,
    spanY > 0 ? innerHeight / spanY : Infinity,
  ];
  const scale = Math.min(...scales);
  const fit = Number.isFinite(scale) ? scale : 0;

  const offsetX = padding + (innerWidth - spanX * fit) / 2;
  const offsetY = padding + (innerHeight - spanY * fit) / 2;
  return flat.map((point) => ({
    x: round(offsetX + (point.x - minX) * fit),
    y: round(offsetY + (point.y - minY) * fit),
  }));
}
