import type { LngLat } from '@heremita/shared';

/** Mean Earth radius (IUGG), metres. */
const EARTH_RADIUS_METERS = 6_371_008.8;
const RADIANS_PER_DEGREE = Math.PI / 180;
/** Polyline values are 5-bit chunks offset by this, so every char is printable ASCII. */
const CHUNK_OFFSET = 63;
const CONTINUATION_BIT = 0x20;
const CHUNK_SIZE = 32;

/** Great-circle distance in metres. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * RADIANS_PER_DEGREE;
  const dLng = (b.lng - a.lng) * RADIANS_PER_DEGREE;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RADIANS_PER_DEGREE) *
      Math.cos(b.lat * RADIANS_PER_DEGREE) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Google encoded polyline (lat, lng order) at the given precision; 5 everywhere in Heremita. */
export function encodePolyline(points: readonly LngLat[], precision = 5): string {
  const factor = 10 ** precision;
  let out = '';
  let previousLat = 0;
  let previousLng = 0;
  const encodeValue = (delta: number) => {
    let value = delta < 0 ? -2 * delta - 1 : 2 * delta;
    while (value >= CONTINUATION_BIT) {
      out += String.fromCharCode((CONTINUATION_BIT | value % CHUNK_SIZE) + CHUNK_OFFSET);
      value = Math.floor(value / CHUNK_SIZE);
    }
    out += String.fromCharCode(value + CHUNK_OFFSET);
  };
  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    encodeValue(lat - previousLat);
    encodeValue(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return out;
}

/** Inverse of {@link encodePolyline}. Arithmetic, not bit ops, so precision 6 cannot overflow. */
export function decodePolyline(encoded: string, precision = 5): LngLat[] {
  const factor = 10 ** precision;
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const decodeValue = () => {
    let result = 0;
    let scale = 1;
    let chunk: number;
    do {
      if (index >= encoded.length) {
        throw new Error('truncated polyline');
      }
      chunk = encoded.charCodeAt(index++) - CHUNK_OFFSET;
      result += (chunk % CHUNK_SIZE) * scale;
      scale *= CHUNK_SIZE;
    } while (chunk >= CONTINUATION_BIT);
    return result % 2 === 1 ? -(result + 1) / 2 : result / 2;
  };
  while (index < encoded.length) {
    lat += decodeValue();
    lng += decodeValue();
    points.push({ lng: lng / factor, lat: lat / factor });
  }
  return points;
}
