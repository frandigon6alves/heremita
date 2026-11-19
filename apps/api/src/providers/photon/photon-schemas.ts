// The parts of Photon (1.3) answers Heremita relies on. `z.object` strips
// unknown keys, so new upstream fields never break parsing.
import { z } from 'zod';

const lngLatTuple = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const photonFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.literal('Point'), coordinates: lngLatTuple }),
  properties: z.object({
    osm_type: z.enum(['N', 'W', 'R']),
    osm_id: z.int().positive(),
    osm_key: z.string().min(1),
    osm_value: z.string().min(1),
    /** Layer: house, street, locality, district, city, county, state, country, other. */
    type: z.string().optional(),
    /** Absent for plain addresses. */
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
    country: z.string().optional(),
    countrycode: z.string().length(2).optional(),
    /** `[west, north, east, south]`. */
    extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  }),
});
export type PhotonFeature = z.infer<typeof photonFeatureSchema>;

/** The envelope is checked strictly, each feature on its own: one odd feature never sinks the list. */
export const photonEnvelopeSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.unknown()),
});
