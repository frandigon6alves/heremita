import { z } from 'zod';
import {
  idSchema,
  latitudeSchema,
  limitQuery,
  lngLatSchema,
  localeSchema,
  longitudeSchema,
  placeCategorySchema,
  type PlaceCategory,
} from './common.js';
import { LIMITS } from './limits.js';
import { reviewSchema } from './reviews.js';

/** Canonical key of an OpenStreetMap object: `osm:<N|W|R>:<id>`, e.g. `osm:W:1370081491`. */
export const placeKeySchema = z.string().regex(/^osm:[NWR]:[1-9]\d{0,19}$/);
export type PlaceKey = z.infer<typeof placeKeySchema>;

export const osmTypeSchema = z.enum(['N', 'W', 'R']);
export const placeSourceSchema = z.enum(['osm', 'custom']);
export const placeKindSchema = z.enum(['poi', 'address', 'street', 'area']);

export const placeSummarySchema = z
  .object({
    id: idSchema,
    source: placeSourceSchema,
    key: placeKeySchema.nullable(),
    name: z.string(),
    label: z.string().nullable(),
    category: placeCategorySchema,
    location: lngLatSchema,
    countryCode: z.string().length(2).nullable(),
  })
  .meta({ id: 'PlaceSummary' });
export type PlaceSummary = z.infer<typeof placeSummarySchema>;

const distributionSchema = z.tuple([
  z.int().min(0),
  z.int().min(0),
  z.int().min(0),
  z.int().min(0),
  z.int().min(0),
]);

/** Average and distribution (counts of 1..5 stars) are present iff `count >= RATING_AVERAGE_MIN_COUNT`. */
export const ratingSummarySchema = z
  .object({
    count: z.int().min(0),
    average: z.number().min(1).max(5).nullable(),
    distribution: distributionSchema.nullable(),
  })
  .refine(
    (summary) =>
      summary.count >= LIMITS.RATING_AVERAGE_MIN_COUNT ===
      (summary.average !== null && summary.distribution !== null),
    { message: 'average and distribution must be set iff count reaches the minimum' },
  )
  .meta({ id: 'RatingSummary' });
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

export const boundingBoxSchema = z.object({
  west: longitudeSchema,
  south: latitudeSchema,
  east: longitudeSchema,
  north: latitudeSchema,
});
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const placeAddressSchema = z.object({
  houseNumber: z.string().optional(),
  street: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
});
export type PlaceAddress = z.infer<typeof placeAddressSchema>;

/** A geocoder hit. `placeId` and `rating` are set when the place already has a canonical row. */
export const placeResultSchema = z
  .object({
    key: placeKeySchema,
    ref: z.object({ osmType: osmTypeSchema, osmId: z.int().positive() }),
    name: z.string(),
    label: z.string(),
    category: placeCategorySchema,
    kind: placeKindSchema,
    location: lngLatSchema,
    bbox: boundingBoxSchema.optional(),
    address: placeAddressSchema,
    placeId: idSchema.nullable(),
    rating: ratingSummarySchema.nullable(),
  })
  .meta({ id: 'PlaceResult' });
export type PlaceResult = z.infer<typeof placeResultSchema>;

export const placeResultsSchema = z
  .object({ items: z.array(placeResultSchema) })
  .meta({ id: 'PlaceResults' });
export type PlaceResults = z.infer<typeof placeResultsSchema>;

function parseNumbers(value: string, count: number): number[] | null {
  const parts = value.split(',');
  if (parts.length !== count || parts.some((part) => part.trim() === '')) {
    return null;
  }
  const numbers = parts.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

/** `"lng,lat"` → `{lng, lat}`. */
const nearQuerySchema = z
  .string()
  .transform((value, ctx) => {
    const numbers = parseNumbers(value, 2);
    const point = numbers && lngLatSchema.safeParse({ lng: numbers[0], lat: numbers[1] });
    if (!point?.success) {
      ctx.addIssue({ code: 'custom', message: 'Expected "lng,lat"' });
      return z.NEVER;
    }
    return point.data;
  })
  .meta({ description: 'Bias point "lng,lat"', examples: ['-9.1393,38.7223'] });

/** `"west,south,east,north"` → bounding box. */
const withinQuerySchema = z
  .string()
  .transform((value, ctx) => {
    const numbers = parseNumbers(value, 4);
    const box =
      numbers &&
      boundingBoxSchema.safeParse({
        west: numbers[0],
        south: numbers[1],
        east: numbers[2],
        north: numbers[3],
      });
    if (!box?.success) {
      ctx.addIssue({ code: 'custom', message: 'Expected "west,south,east,north"' });
      return z.NEVER;
    }
    return box.data;
  })
  .meta({
    description: 'Bounding box "west,south,east,north"',
    examples: ['-9.23,38.69,-9.09,38.80'],
  });

/** `"sight,food"` → unique categories. */
const categoriesQuerySchema = z
  .string()
  .transform((value, ctx) => {
    const categories = new Set<PlaceCategory>();
    for (const part of value.split(',')) {
      const category = placeCategorySchema.safeParse(part.trim());
      if (!category.success) {
        ctx.addIssue({ code: 'custom', message: `Unknown category "${part}"` });
        return z.NEVER;
      }
      categories.add(category.data);
    }
    return [...categories];
  })
  .meta({ description: 'Comma-separated place categories', examples: ['sight,food'] });

export const placeSearchIntentSchema = z.enum(['autocomplete', 'submit']);

/** Either `q` has at least `SEARCH_Q_MIN` characters or `categories` is set (category browsing). */
export const searchPlacesQuerySchema = z
  .strictObject({
    q: z.string().trim().max(LIMITS.SEARCH_Q_MAX).default(''),
    locale: localeSchema,
    intent: placeSearchIntentSchema.default('autocomplete'),
    near: nearQuerySchema.optional(),
    zoom: z.coerce.number().int().min(0).max(LIMITS.ZOOM_MAX).optional(),
    within: withinQuerySchema.optional(),
    categories: categoriesQuerySchema.optional(),
    limit: limitQuery(LIMITS.SEARCH_LIMIT.max, LIMITS.SEARCH_LIMIT.default),
  })
  .refine((query) => query.q.length >= LIMITS.SEARCH_Q_MIN || query.categories !== undefined, {
    message: `Type at least ${LIMITS.SEARCH_Q_MIN} characters`,
    path: ['q'],
  });
export type SearchPlacesQuery = z.input<typeof searchPlacesQuerySchema>;

export const reverseQuerySchema = z.strictObject({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  locale: localeSchema,
});
export type ReverseQuery = z.input<typeof reverseQuerySchema>;

/** `inMyTrips` is `[]` and `myReview` is `null` for anonymous viewers. */
export const placeDetailSchema = z
  .object({
    place: placeSummarySchema,
    rating: ratingSummarySchema,
    inMyTrips: z.array(
      z.object({ tripId: idSchema, tripTitle: z.string(), tripPlaceId: idSchema }),
    ),
    myReview: reviewSchema.nullable(),
  })
  .meta({ id: 'PlaceDetail' });
export type PlaceDetail = z.infer<typeof placeDetailSchema>;
