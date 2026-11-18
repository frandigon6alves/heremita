import { z } from 'zod';
import {
  idSchema,
  isoDateSchema,
  lngLatInputSchema,
  lngLatSchema,
  timestampSchema,
  travelModeSchema,
  userCardSchema,
} from './common.js';
import { LIMITS } from './limits.js';
import { textSchema } from './text.js';

export const visibilitySchema = z.enum(['private', 'link', 'public']);
export type Visibility = z.infer<typeof visibilitySchema>;

/** 16 random bytes, base64url: 22 characters. Appears only in paths, never in query strings. */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);

/** Destination in request bodies. */
export const destinationSchema = z.strictObject({
  name: textSchema(1, LIMITS.DESTINATION_NAME_MAX),
  countryCode: countryCodeSchema.nullable(),
  center: lngLatInputSchema.nullable(),
});
export type DestinationInput = z.input<typeof destinationSchema>;

/** Destination in responses. */
export const tripDestinationSchema = z
  .object({
    name: z.string(),
    countryCode: countryCodeSchema.nullable(),
    center: lngLatSchema.nullable(),
  })
  .meta({ id: 'Destination' });
export type Destination = z.infer<typeof tripDestinationSchema>;

const tripTitleSchema = textSchema(1, LIMITS.TRIP_TITLE_MAX);

export const createTripBodySchema = z
  .strictObject({
    title: tripTitleSchema,
    destination: destinationSchema.nullable().default(null),
    startDate: isoDateSchema.nullable().default(null),
    dayCount: z.int().min(0).max(LIMITS.DAYS_PER_TRIP).default(1),
    defaultMode: travelModeSchema.default('walk'),
  })
  .meta({ id: 'CreateTripBody' });
export type CreateTripBody = z.input<typeof createTripBodySchema>;

/** Days are added and removed through their own endpoints, so there is no `dayCount` here. */
export const updateTripBodySchema = z
  .strictObject({
    title: tripTitleSchema.optional(),
    description: textSchema(0, LIMITS.TRIP_DESCRIPTION_MAX).nullable().optional(),
    destination: destinationSchema.nullable().optional(),
    startDate: isoDateSchema.nullable().optional(),
    defaultMode: travelModeSchema.optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' })
  .meta({ id: 'UpdateTripBody' });
export type UpdateTripBody = z.input<typeof updateTripBodySchema>;

export const copyTripBodySchema = z
  .strictObject({ title: tripTitleSchema.optional() })
  .meta({ id: 'CopyTripBody' });
export type CopyTripBody = z.input<typeof copyTripBodySchema>;

const copiedFromSchema = z.object({ id: idSchema, title: z.string() });

export const tripOwnerSchema = z
  .object({
    viewerRole: z.literal('owner'),
    id: idSchema,
    title: z.string(),
    description: z.string().nullable(),
    destination: tripDestinationSchema.nullable(),
    startDate: isoDateSchema.nullable(),
    dayCount: z.int().min(0),
    placeCount: z.int().min(0),
    defaultMode: travelModeSchema,
    visibility: visibilitySchema,
    shareToken: shareTokenSchema.nullable(),
    author: userCardSchema,
    copiedFrom: copiedFromSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .meta({ id: 'TripOwner' });
export type TripOwner = z.infer<typeof tripOwnerSchema>;

/** What anyone but the owner sees: no `startDate`, no `shareToken`. */
export const tripPublicSchema = z
  .object({
    viewerRole: z.literal('viewer'),
    id: idSchema,
    title: z.string(),
    description: z.string().nullable(),
    destination: tripDestinationSchema.nullable(),
    dayCount: z.int().min(0),
    placeCount: z.int().min(0),
    defaultMode: travelModeSchema,
    visibility: z.enum(['link', 'public']),
    author: userCardSchema,
    copiedFrom: copiedFromSchema.nullable(),
    publishedAt: timestampSchema.nullable(),
    copyCount: z.int().min(0),
  })
  .meta({ id: 'TripPublic' });
export type TripPublic = z.infer<typeof tripPublicSchema>;

export const tripSchema = z
  .discriminatedUnion('viewerRole', [tripOwnerSchema, tripPublicSchema])
  .meta({ id: 'Trip' });
export type Trip = z.infer<typeof tripSchema>;

const previewPointsSchema = z.array(lngLatSchema).max(LIMITS.PREVIEW_POINTS_MAX);

export const myTripCardSchema = z
  .object({
    id: idSchema,
    title: z.string(),
    destinationName: z.string().nullable(),
    startDate: isoDateSchema.nullable(),
    dayCount: z.int().min(0),
    placeCount: z.int().min(0),
    visibility: visibilitySchema,
    updatedAt: timestampSchema,
    previewPoints: previewPointsSchema,
  })
  .meta({ id: 'MyTripCard' });
export type MyTripCard = z.infer<typeof myTripCardSchema>;

export const publicTripCardSchema = z
  .object({
    id: idSchema,
    title: z.string(),
    destinationName: z.string().nullable(),
    countryCode: countryCodeSchema.nullable(),
    dayCount: z.int().min(0),
    placeCount: z.int().min(0),
    defaultMode: travelModeSchema,
    copyCount: z.int().min(0),
    author: userCardSchema,
    previewPoints: previewPointsSchema,
    publishedAt: timestampSchema,
  })
  .meta({ id: 'PublicTripCard' });
export type PublicTripCard = z.infer<typeof publicTripCardSchema>;

export const shareTokenResponseSchema = z
  .object({ shareToken: shareTokenSchema })
  .meta({ id: 'ShareTokenResponse' });
export type ShareTokenResponse = z.infer<typeof shareTokenResponseSchema>;
