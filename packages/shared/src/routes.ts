import { z } from 'zod';
import { idSchema, travelModeSchema } from './common.js';
import { legSummarySchema } from './plan.js';

/** `mode` overrides the mode of every leg for this read only; nothing is stored. */
export const routeQuerySchema = z.strictObject({ mode: travelModeSchema.optional() });
export type RouteQuery = z.input<typeof routeQuerySchema>;

export const routeProviderSchema = z.enum(['osrm-fossgis', 'fake', 'estimate']);
export type RouteProvider = z.infer<typeof routeProviderSchema>;

export const routeQualitySchema = z.enum(['routed', 'partial', 'estimated']);
export type RouteQuality = z.infer<typeof routeQualitySchema>;

/** `polyline` is an encoded polyline with precision 5; an estimated leg is a straight 2-point line. */
export const legSchema = legSummarySchema
  .extend({
    polyline: z.string(),
    provider: routeProviderSchema,
    unroutable: z.boolean(),
  })
  .meta({ id: 'Leg' });
export type Leg = z.infer<typeof legSchema>;

export const dayRouteSchema = z
  .object({
    dayId: idSchema,
    planVersion: z.int().min(0),
    modeOverride: travelModeSchema.nullable(),
    quality: routeQualitySchema,
    distanceMeters: z.number().min(0),
    durationSeconds: z.number().min(0),
    legs: z.array(legSchema),
    attribution: z.string(),
  })
  .meta({ id: 'DayRoute' });
export type DayRoute = z.infer<typeof dayRouteSchema>;

export const orderSuggestionQuerySchema = z.strictObject({
  keepLast: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});
export type OrderSuggestionQuery = z.input<typeof orderSuggestionQuerySchema>;

const routeTotalsSchema = z.object({
  distanceMeters: z.number().min(0),
  durationSeconds: z.number().min(0),
});

/** Suggested visit order; nothing is written until the client applies it through the stop-order endpoint. */
export const orderSuggestionSchema = z
  .object({
    dayId: idSchema,
    planVersion: z.int().min(0),
    stopIds: z.array(idSchema),
    before: routeTotalsSchema,
    after: routeTotalsSchema,
    estimated: z.boolean(),
  })
  .meta({ id: 'OrderSuggestion' });
export type OrderSuggestion = z.infer<typeof orderSuggestionSchema>;
