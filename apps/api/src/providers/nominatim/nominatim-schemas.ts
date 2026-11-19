// The parts of Nominatim (5.x, `format=jsonv2`) answers Heremita relies on.
// Coordinates and bounding boxes arrive as strings.
import { z } from 'zod';

const numeric = (min: number, max: number) =>
  z.string().transform(Number).pipe(z.number().min(min).max(max));

export const nominatimPlaceSchema = z.object({
  osm_type: z.enum(['node', 'way', 'relation']),
  osm_id: z.int().positive(),
  lat: numeric(-90, 90),
  lon: numeric(-180, 180),
  /** OSM class (`class` outside jsonv2). */
  category: z.string().min(1),
  type: z.string().min(1),
  addresstype: z.string().optional(),
  name: z.string().optional(),
  display_name: z.string(),
  address: z.record(z.string(), z.string()).optional(),
  /** `[south, north, west, east]`. */
  boundingbox: z
    .tuple([numeric(-90, 90), numeric(-90, 90), numeric(-180, 180), numeric(-180, 180)])
    .optional(),
});
export type NominatimPlace = z.infer<typeof nominatimPlaceSchema>;

/** Search and lookup answer a list, each item checked on its own. */
export const nominatimListSchema = z.array(z.unknown());
