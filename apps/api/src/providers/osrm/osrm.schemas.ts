// The parts of an OSRM v5 `/route` answer Heremita relies on. `z.object` strips
// unknown keys, so new upstream fields never break parsing.
import { z } from 'zod';

const lngLatTuple = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const osrmWaypointSchema = z.object({
  /** Where OSRM put the stop on its network. */
  location: lngLatTuple,
  /** Metres between the requested coordinate and `location`. */
  distance: z.number().nonnegative(),
});

const osrmLegSchema = z.object({
  distance: z.number().nonnegative(),
  duration: z.number().nonnegative(),
});

export const osrmRouteOkSchema = z.object({
  code: z.literal('Ok'),
  routes: z
    .array(
      z.object({
        /** Polyline precision 5 of the whole route (`overview=full`). */
        geometry: z.string(),
        legs: z.array(osrmLegSchema).min(1),
      }),
    )
    .min(1),
  waypoints: z.array(osrmWaypointSchema).min(2),
});
export type OsrmRouteOk = z.infer<typeof osrmRouteOkSchema>;

/** Any non-`Ok` code: OSRM sends these with 400 and, sometimes, with 200. */
export const osrmErrorSchema = z.object({
  code: z.string().refine((code) => code !== 'Ok'),
  message: z.string().optional(),
});
export type OsrmError = z.infer<typeof osrmErrorSchema>;
