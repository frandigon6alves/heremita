// Small geo helpers: Google encoded polyline (precision 5 or 6) and haversine distance.
export type LngLat = { lng: number; lat: number };

export function decodePolyline(encoded: string, precision = 5): LngLat[] {
  const factor = 10 ** precision;
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result += (byte & 0x1f) * 2 ** shift; // no 32-bit overflow for precision 6
        shift += 5;
      } while (byte >= 0x20);
      const delta = result % 2 === 1 ? -(result + 1) / 2 : result / 2;
      if (axis === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

export function encodePolyline(points: LngLat[], precision = 5): string {
  const factor = 10 ** precision;
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (current: number, previous: number) => {
    let v = current - previous;
    v = v < 0 ? -2 * v - 1 : 2 * v;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v % 32)) + 63);
      v = Math.floor(v / 32);
    }
    out += String.fromCharCode(v + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lng = Math.round(p.lng * factor);
    encodeValue(lat, prevLat);
    encodeValue(lng, prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
