import { z } from 'zod';
import { LIMITS } from './limits.js';
import { LOCALES, THEMES, TRAVEL_MODES } from './options.js';

/**
 * Opaque identifier (UUIDv7 in practice); format-checked so a garbage id never
 * reaches SQL. Lower-cased: a UUID is case-insensitive and PostgreSQL treats
 * both spellings as one id, so code comparing ids as strings must see one too.
 */
export const idSchema = z.uuid().overwrite((id) => id.toLowerCase());

/** ISO-8601 UTC timestamp; only the `Z` designator is accepted. */
export const timestampSchema = z.iso.datetime();

/** Calendar date `YYYY-MM-DD`. */
export const isoDateSchema = z.iso.date();

/** Calendar month `YYYY-MM`. */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** `LOCALES`; `Locale` and `DEFAULT_LOCALE` live in `options.ts`. */
export const localeSchema = z.enum(LOCALES);

export const themeSchema = z.enum(THEMES);

export const travelModeSchema = z.enum(TRAVEL_MODES);

export const placeCategorySchema = z.enum([
  'sight',
  'food',
  'cafe',
  'nightlife',
  'lodging',
  'shopping',
  'nature',
  'beach',
  'culture',
  'transport',
  'activity',
  'other',
]);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

export const longitudeSchema = z.number().min(-180).max(180);
export const latitudeSchema = z.number().min(-90).max(90);

export const lngLatSchema = z
  .object({ lng: longitudeSchema, lat: latitudeSchema })
  .meta({ id: 'LngLat' });
export type LngLat = z.infer<typeof lngLatSchema>;

/** `lngLatSchema` for request bodies: unknown keys are rejected. */
export const lngLatInputSchema = z.strictObject(lngLatSchema.shape);

/** Opaque keyset cursor returned as `nextCursor` and sent back unchanged. */
export const cursorSchema = z
  .string()
  .max(LIMITS.CURSOR_MAX)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Page size of a list endpoint. Query strings only: it coerces. */
export function limitQuery(max: number, fallback: number) {
  return z.coerce.number().int().min(1).max(max).default(fallback);
}

/** Query of a keyset-paginated list. */
export function pageQuerySchema(size: { default: number; max: number }) {
  return z.strictObject({
    limit: limitQuery(size.max, size.default),
    cursor: cursorSchema.optional(),
  });
}

/** Keyset page: `nextCursor` is `null` on the last page. */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: cursorSchema.nullable() });
}

export type Page<T> = { items: T[]; nextCursor: string | null };

export const userCardSchema = z
  .object({ id: idSchema, displayName: z.string(), isDemo: z.boolean() })
  .meta({ id: 'UserCard' });
export type UserCard = z.infer<typeof userCardSchema>;
