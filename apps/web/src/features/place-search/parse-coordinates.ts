import { lngLatSchema, type LngLat } from '@heremita/shared';

/**
 * Typed `lat, lng` → point. Accepts `38.7139, -9.1334`, `38.7139 -9.1334`
 * and, for decimal commas, `38,7139; -9,1334`. `null` when it is not a point
 * on Earth.
 */
export function parseCoordinates(text: string): LngLat | null {
  const trimmed = text.trim();
  const parts = trimmed.includes(';')
    ? trimmed.split(';').map((part) => part.replace(',', '.'))
    : trimmed.split(/\s*,\s*|\s+/);
  if (parts.length !== 2 || parts.some((part) => !/^[+-]?\d+(\.\d+)?$/.test(part.trim()))) {
    return null;
  }
  const [lat, lng] = parts.map(Number);
  const point = lngLatSchema.safeParse({ lng, lat });
  return point.success ? point.data : null;
}
