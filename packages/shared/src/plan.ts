import { z } from 'zod';
import {
  idSchema,
  isoDateSchema,
  lngLatInputSchema,
  placeCategorySchema,
  timestampSchema,
  travelModeSchema,
} from './common.js';
import { LIMITS } from './limits.js';
import { placeKeySchema, placeSummarySchema, ratingSummarySchema } from './places.js';
import { textSchema } from './text.js';
import { tripOwnerSchema, tripPublicSchema } from './trips.js';

const planVersionSchema = z.int().min(0);
const indexSchema = z.int().min(0);
const noteSchema = textSchema(0, LIMITS.NOTE_MAX);
const placeNameSchema = textSchema(1, LIMITS.PLACE_NAME_MAX);

/** `modeToNext` null = the day's mode; ignored on the last stop. */
export const stopSchema = z
  .object({ id: idSchema, tripPlaceId: idSchema, modeToNext: travelModeSchema.nullable() })
  .meta({ id: 'Stop' });
export type Stop = z.infer<typeof stopSchema>;

const dayShape = {
  id: idSchema,
  number: z.int().min(1),
  mode: travelModeSchema,
  modeOverride: travelModeSchema.nullable(),
  stops: z.array(stopSchema),
};

/** `stops` in visit order; `mode` is the effective mode (`modeOverride ?? trip.defaultMode`); `date` derives from the trip start date. */
export const dayOwnerSchema = z
  .object({ ...dayShape, date: isoDateSchema.nullable() })
  .meta({ id: 'DayOwner' });
export type DayOwner = z.infer<typeof dayOwnerSchema>;

export const dayViewerSchema = z.object(dayShape).meta({ id: 'DayViewer' });
export type DayViewer = z.infer<typeof dayViewerSchema>;

const tripPlaceShape = {
  id: idSchema,
  place: placeSummarySchema,
  rating: ratingSummarySchema,
  addedAt: timestampSchema,
};

/** `note` is owner-private: it never appears in the viewer shape. */
export const tripPlaceOwnerSchema = z
  .object({ ...tripPlaceShape, note: z.string().nullable() })
  .meta({ id: 'TripPlaceOwner' });
export type TripPlaceOwner = z.infer<typeof tripPlaceOwnerSchema>;

export const tripPlaceViewerSchema = z.object(tripPlaceShape).meta({ id: 'TripPlaceViewer' });
export type TripPlaceViewer = z.infer<typeof tripPlaceViewerSchema>;

export const legSummarySchema = z
  .object({
    fromStopId: idSchema,
    toStopId: idSchema,
    mode: travelModeSchema,
    distanceMeters: z.number().min(0),
    durationSeconds: z.number().min(0),
    estimated: z.boolean(),
  })
  .meta({ id: 'LegSummary' });
export type LegSummary = z.infer<typeof legSummarySchema>;

/** Cached legs only: a `null` leg is not cached yet, and totals are `null` unless every leg is known. */
export const dayRouteSummarySchema = z
  .object({
    dayId: idSchema,
    legs: z.array(legSummarySchema.nullable()),
    distanceMeters: z.number().min(0).nullable(),
    durationSeconds: z.number().min(0).nullable(),
  })
  .meta({ id: 'DayRouteSummary' });
export type DayRouteSummary = z.infer<typeof dayRouteSummarySchema>;

export const tripPlanOwnerSchema = z
  .object({
    viewerRole: z.literal('owner'),
    trip: tripOwnerSchema,
    planVersion: planVersionSchema,
    places: z.array(tripPlaceOwnerSchema),
    days: z.array(dayOwnerSchema),
    routes: z.array(dayRouteSummarySchema),
  })
  .meta({ id: 'TripPlanOwner' });
export type TripPlanOwner = z.infer<typeof tripPlanOwnerSchema>;

export const tripPlanViewerSchema = z
  .object({
    viewerRole: z.literal('viewer'),
    trip: tripPublicSchema,
    planVersion: planVersionSchema,
    places: z.array(tripPlaceViewerSchema),
    days: z.array(dayViewerSchema),
    routes: z.array(dayRouteSummarySchema),
  })
  .meta({ id: 'TripPlanViewer' });
export type TripPlanViewer = z.infer<typeof tripPlanViewerSchema>;

export const tripPlanSchema = z
  .discriminatedUnion('viewerRole', [tripPlanOwnerSchema, tripPlanViewerSchema])
  .meta({ id: 'TripPlan' });
export type TripPlan = z.infer<typeof tripPlanSchema>;

const osmPlaceInputSchema = z.strictObject({ type: z.literal('osm'), key: placeKeySchema });

const customPlaceInputSchema = z.strictObject({
  type: z.literal('custom'),
  name: placeNameSchema,
  category: placeCategorySchema.default('other'),
  location: lngLatInputSchema,
});

/** OSM places are resolved by key on the server; client-sent names or coordinates are never stored for them. */
export const addTripPlaceBodySchema = z
  .strictObject({
    place: z.discriminatedUnion('type', [osmPlaceInputSchema, customPlaceInputSchema]),
    note: noteSchema.nullable().default(null),
    schedule: z
      .strictObject({ dayId: idSchema, index: indexSchema.optional() })
      .nullable()
      .default(null),
  })
  .meta({ id: 'AddTripPlaceBody' });
export type AddTripPlaceBody = z.input<typeof addTripPlaceBodySchema>;

export const addTripPlaceResponseSchema = z
  .object({
    tripPlace: tripPlaceOwnerSchema,
    stopId: idSchema.nullable(),
    planVersion: planVersionSchema,
  })
  .meta({ id: 'AddTripPlaceResponse' });
export type AddTripPlaceResponse = z.infer<typeof addTripPlaceResponseSchema>;

/** `name`, `category` and `location` apply to custom places only (else 422 `not_a_custom_place`). */
export const updateTripPlaceBodySchema = z
  .strictObject({
    note: noteSchema.nullable().optional(),
    name: placeNameSchema.optional(),
    category: placeCategorySchema.optional(),
    location: lngLatInputSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' })
  .meta({ id: 'UpdateTripPlaceBody' });
export type UpdateTripPlaceBody = z.input<typeof updateTripPlaceBodySchema>;

export const updateTripPlaceResponseSchema = z
  .object({ tripPlace: tripPlaceOwnerSchema, planVersion: planVersionSchema })
  .meta({ id: 'UpdateTripPlaceResponse' });
export type UpdateTripPlaceResponse = z.infer<typeof updateTripPlaceResponseSchema>;

/** Without `index` the day is appended. */
export const createDayBodySchema = z
  .strictObject({ index: indexSchema.optional() })
  .meta({ id: 'CreateDayBody' });
export type CreateDayBody = z.input<typeof createDayBodySchema>;

export const createDayResponseSchema = z
  .object({ day: dayOwnerSchema, planVersion: planVersionSchema })
  .meta({ id: 'CreateDayResponse' });
export type CreateDayResponse = z.infer<typeof createDayResponseSchema>;

export const updateDayBodySchema = z
  .strictObject({ modeOverride: travelModeSchema.nullable() })
  .meta({ id: 'UpdateDayBody' });
export type UpdateDayBody = z.input<typeof updateDayBodySchema>;

/** Without `index` the stop is appended; an index past the end is clamped. */
export const addStopBodySchema = z
  .strictObject({ tripPlaceId: idSchema, index: indexSchema.optional() })
  .meta({ id: 'AddStopBody' });
export type AddStopBody = z.input<typeof addStopBodySchema>;

export const addStopResponseSchema = z
  .object({ stop: stopSchema, planVersion: planVersionSchema })
  .meta({ id: 'AddStopResponse' });
export type AddStopResponse = z.infer<typeof addStopResponseSchema>;

/** Full new order of a day: must be a permutation of its current stops (else 409 `plan_changed`). */
export const stopOrderBodySchema = z
  .strictObject({ stopIds: z.array(idSchema).max(LIMITS.STOPS_PER_DAY) })
  .refine((body) => new Set(body.stopIds).size === body.stopIds.length, {
    message: 'Stop ids must be unique',
    path: ['stopIds'],
  })
  .meta({ id: 'StopOrderBody' });
export type StopOrderBody = z.input<typeof stopOrderBodySchema>;

/** Moves a stop to `index` of `dayId` (same or other day); the index is clamped. */
export const stopPlacementBodySchema = z
  .strictObject({ dayId: idSchema, index: indexSchema })
  .meta({ id: 'StopPlacementBody' });
export type StopPlacementBody = z.input<typeof stopPlacementBodySchema>;

export const updateStopBodySchema = z
  .strictObject({ modeToNext: travelModeSchema.nullable() })
  .meta({ id: 'UpdateStopBody' });
export type UpdateStopBody = z.input<typeof updateStopBodySchema>;

export const planChangeSchema = z
  .object({ planVersion: planVersionSchema })
  .meta({ id: 'PlanChange' });
export type PlanChange = z.infer<typeof planChangeSchema>;
