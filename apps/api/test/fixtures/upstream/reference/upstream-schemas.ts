// zod schemas for the parts of the upstream responses Heremita relies on.
// z.object() strips unknown keys (zod 4), so new upstream fields never break parsing.
import { z } from 'zod';

const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

// ---------- Photon (photon.komoot.io, v1.3.0) ----------
export const PhotonProperties = z.object({
  osm_type: z.enum(['N', 'W', 'R']),
  osm_id: z.number().int().positive(),
  osm_key: z.string().min(1),
  osm_value: z.string().min(1),
  type: z.string().optional(), // layer: house|street|locality|district|city|county|state|country|other
  name: z.string().optional(), // absent for plain addresses
  housenumber: z.string().optional(),
  street: z.string().optional(),
  locality: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  countrycode: z.string().length(2).optional(),
  postcode: z.string().optional(),
  extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(), // [west, north, east, south]
  extra: z.record(z.string(), z.unknown()).optional(),
});
export const PhotonFeature = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.literal('Point'), coordinates: lonLat }),
  properties: PhotonProperties,
});
// Envelope is validated strictly, features one by one (a single odd feature must not sink the list).
export const PhotonEnvelope = z.object({ features: z.array(z.unknown()) });
export const PhotonError = z.union([
  z.object({ message: z.string() }),
  z.record(z.string(), z.array(z.object({ message: z.string() }))),
]);
export const PhotonStatus = z.object({ status: z.string(), import_date: z.string().optional(), version: z.string().optional() });

// ---------- OSRM v5 (routing.openstreetmap.de/routed-{foot,bike,car}) ----------
export const OsrmWaypoint = z.object({
  location: lonLat, // snapped position
  distance: z.number().nonnegative(), // metres between the input and the snapped position
  name: z.string(),
});
export const OsrmLeg = z.object({ distance: z.number().nonnegative(), duration: z.number().nonnegative() });
const OsrmPath = z.object({
  distance: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  geometry: z.string().optional(), // encoded polyline (absent when overview=false)
  legs: z.array(OsrmLeg).min(1),
});
export const OsrmRouteOk = z.object({
  code: z.literal('Ok'),
  routes: z.array(OsrmPath).min(1),
  waypoints: z.array(OsrmWaypoint).min(2),
});
export const OsrmTableOk = z.object({
  code: z.literal('Ok'),
  durations: z.array(z.array(z.number().nonnegative().nullable())), // null = no route between the pair
  sources: z.array(OsrmWaypoint),
  destinations: z.array(OsrmWaypoint),
});
export const OsrmTripOk = z.object({
  code: z.literal('Ok'),
  trips: z.array(OsrmPath).min(1),
  // waypoints are in INPUT order; waypoint_index is the position of that input in the optimised trip
  waypoints: z.array(OsrmWaypoint.extend({ waypoint_index: z.number().int().nonnegative(), trips_index: z.number().int().nonnegative() })),
});
export const OsrmError = z.object({
  code: z.string().refine((c) => c !== 'Ok'), // NoRoute | NoSegment | TooBig | InvalidQuery | InvalidOptions | InvalidValue | NoTrips | NoTable | NotImplemented ...
  message: z.string().optional(),
});

// ---------- Valhalla 3.x (valhalla1.openstreetmap.de), optional second routing provider ----------
const ValhallaSummary = z.object({ length: z.number().nonnegative(), time: z.number().nonnegative(), has_ferry: z.boolean().optional() });
export const ValhallaTripOk = z.object({
  trip: z.object({
    status: z.literal(0),
    units: z.string(),
    summary: ValhallaSummary,
    legs: z.array(z.object({ shape: z.string(), summary: ValhallaSummary })).min(1), // shape = polyline, precision 6
    locations: z.array(z.object({ lat: z.number(), lon: z.number(), original_index: z.number().int().optional() })),
  }),
});
export const ValhallaError = z.object({ error_code: z.number().int(), error: z.string(), status_code: z.number().int() });

// ---------- Nominatim 5.x (opt-in only, see usage policy) ----------
export const NominatimPlace = z.object({
  osm_type: z.enum(['node', 'way', 'relation']).optional(), // absent for postcodes
  osm_id: z.number().int().positive().optional(),
  lat: z.string(),
  lon: z.string(),
  category: z.string(), // jsonv2 name of "class"
  type: z.string(),
  name: z.string().optional(),
  display_name: z.string(),
  address: z.record(z.string(), z.string()).optional(),
  boundingbox: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(), // [south, north, west, east]
  extratags: z.record(z.string(), z.string()).nullable().optional(),
});
export const NominatimSearchOk = z.array(NominatimPlace);
export const NominatimReverse = z.union([NominatimPlace, z.object({ error: z.string() })]); // HTTP 200 + {"error":"Unable to geocode"}
export const NominatimError = z.object({ error: z.object({ code: z.number().int(), message: z.string() }) });
