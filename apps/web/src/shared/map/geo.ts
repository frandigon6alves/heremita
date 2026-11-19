/** `[lng, lat]`, the order MapLibre and GeoJSON use everywhere. */
export type LngLat = readonly [number, number];

/** `[[west, south], [east, north]]`. */
export type Bounds = [[number, number], [number, number]];

const POLYLINE5_FACTOR = 1e5;
const CHUNK_BITS = 5;
const CHUNK_MASK = 0x1f;
const CONTINUE_BIT = 0x20;
const ASCII_OFFSET = 63;

function readValue(encoded: string, start: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let chunk: number;
  do {
    chunk = encoded.charCodeAt(index) - ASCII_OFFSET;
    index += 1;
    result |= (chunk & CHUNK_MASK) << shift;
    shift += CHUNK_BITS;
  } while (chunk >= CONTINUE_BIT);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, next: index };
}

/** Decodes a Google polyline (precision 5, `lat,lng` pairs) into `[lng, lat]` points. */
export function decodePolyline5(encoded: string): LngLat[] {
  const points: LngLat[] = [];
  let lat = 0;
  let lng = 0;
  let index = 0;
  while (index < encoded.length) {
    const latStep = readValue(encoded, index);
    const lngStep = readValue(encoded, latStep.next);
    index = lngStep.next;
    lat += latStep.value;
    lng += lngStep.value;
    points.push([lng / POLYLINE5_FACTOR, lat / POLYLINE5_FACTOR]);
  }
  return points;
}

export function toLngLat(position: GeoJSON.Position): LngLat | null {
  const [lng, lat] = position;
  return lng === undefined || lat === undefined ? null : [lng, lat];
}

/** The smallest box holding every point, or `null` for none. */
export function boundsOf(points: readonly LngLat[]): Bounds | null {
  const [first, ...rest] = points;
  if (!first) {
    return null;
  }
  const bounds: Bounds = [
    [first[0], first[1]],
    [first[0], first[1]],
  ];
  for (const [lng, lat] of rest) {
    bounds[0] = [Math.min(bounds[0][0], lng), Math.min(bounds[0][1], lat)];
    bounds[1] = [Math.max(bounds[1][0], lng), Math.max(bounds[1][1], lat)];
  }
  return bounds;
}
