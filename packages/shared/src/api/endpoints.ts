import { z } from 'zod';
import { logInBodySchema, signUpBodySchema } from '../auth.js';
import { idSchema, pageQuerySchema, pageSchema, userCardSchema } from '../common.js';
import { publicTripsQuerySchema } from '../discovery.js';
import type { ErrorCode } from '../error-codes.js';
import { livenessResponseSchema, readinessResponseSchema } from '../health.js';
import { LIMITS } from '../limits.js';
import {
  changePasswordBodySchema,
  deleteAccountBodySchema,
  meSchema,
  updateMeBodySchema,
} from '../me.js';
import {
  placeDetailSchema,
  placeResultsSchema,
  reverseQuerySchema,
  searchPlacesQuerySchema,
} from '../places.js';
import {
  addStopBodySchema,
  addStopResponseSchema,
  addTripPlaceBodySchema,
  addTripPlaceResponseSchema,
  createDayBodySchema,
  createDayResponseSchema,
  planChangeSchema,
  stopOrderBodySchema,
  stopPlacementBodySchema,
  tripPlanSchema,
  tripPlanViewerSchema,
  updateDayBodySchema,
  updateStopBodySchema,
  updateTripPlaceBodySchema,
  updateTripPlaceResponseSchema,
} from '../plan.js';
import {
  createdIdSchema,
  createReportBodySchema,
  moderationDecisionBodySchema,
  reportItemSchema,
  reportStatusQuerySchema,
} from '../reports.js';
import { placeReviewsQuerySchema, putReviewBodySchema, reviewSchema } from '../reviews.js';
import {
  dayRouteSchema,
  orderSuggestionQuerySchema,
  orderSuggestionSchema,
  routeQuerySchema,
} from '../routes.js';
import {
  copyTripBodySchema,
  createTripBodySchema,
  myTripCardSchema,
  publicTripCardSchema,
  shareTokenResponseSchema,
  shareTokenSchema,
  tripOwnerSchema,
  tripSchema,
  updateTripBodySchema,
} from '../trips.js';
import { userProfileSchema } from '../users.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Who may call an endpoint. Trip ownership is checked by the service (404 when not the owner), so owner endpoints are `required`. */
export type EndpointAuth = 'none' | 'optional' | 'required' | 'moderator';

/** Named per-endpoint throttles; endpoints without one use the default throttle. */
export const THROTTLE_NAMES = ['auth', 'signup', 'search', 'reverse', 'route', 'ugc'] as const;
export type ThrottleName = (typeof THROTTLE_NAMES)[number];

export interface EndpointDef {
  method: HttpMethod;
  /** OpenAPI style, relative to `API_PREFIX`: `/trips/{tripId}/plan`. */
  path: `/${string}`;
  auth: EndpointAuth;
  /** Path parameters; a value that fails it answers 404 of the resource, never 422. */
  params?: z.ZodObject;
  /** Query string: an object schema (strict, coercing). */
  query?: z.ZodType<unknown, Record<string, unknown>>;
  body?: z.ZodType;
  status: 200 | 201 | 204;
  /** Second success status: E46 answers 200 when it replaced an existing review. */
  alternateStatus?: 200;
  /** Absent iff `status` is 204. */
  response?: z.ZodType;
  throttle?: ThrottleName;
  /** Endpoint-specific errors; the ones every endpoint can answer are in `implicitErrorCodes`. */
  errors: readonly ErrorCode[];
}

export const endpoint = <const E extends EndpointDef>(def: E): E => def;

const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hasCursor(schema: z.ZodType | undefined): boolean {
  return schema instanceof z.ZodObject && 'cursor' in schema.shape;
}

/** Errors any endpoint of this shape can answer besides `def.errors` (§I.api "implicit"). */
export function implicitErrorCodes(def: EndpointDef): ErrorCode[] {
  const codes: ErrorCode[] = [
    'malformed_request',
    'payload_too_large',
    'rate_limited',
    'internal_error',
  ];
  if (UNSAFE_METHODS.has(def.method)) {
    codes.push('csrf_rejected');
  }
  if (def.body) {
    codes.push('unsupported_media_type');
  }
  if (def.body || def.query) {
    codes.push('validation_failed');
  }
  if (hasCursor(def.query)) {
    codes.push('invalid_cursor');
  }
  if (def.auth === 'required' || def.auth === 'moderator') {
    codes.push('unauthenticated');
  }
  return codes;
}

const userParams = z.strictObject({ userId: idSchema });
const tripParams = z.strictObject({ tripId: idSchema });
const tripPlaceParams = z.strictObject({ tripId: idSchema, tripPlaceId: idSchema });
const dayParams = z.strictObject({ tripId: idSchema, dayId: idSchema });
const stopParams = z.strictObject({ tripId: idSchema, stopId: idSchema });
const sharedParams = z.strictObject({ shareToken: shareTokenSchema });
const sharedDayParams = z.strictObject({ shareToken: shareTokenSchema, dayId: idSchema });
const placeParams = z.strictObject({ placeId: idSchema });
const reportParams = z.strictObject({ reportId: idSchema });

/** E3 answers the generated document as is: only `openapi` is checked, nothing is stripped. */
const openApiDocumentSchema = z.looseObject({ openapi: z.literal('3.1.0') });

const { PAGE_SIZES } = LIMITS;

/** Every endpoint of `/api/v1` (E1–E51), keyed by the operation name of §I.api. */
export const endpoints = {
  getLiveness: endpoint({
    method: 'GET',
    path: '/health',
    auth: 'none',
    status: 200,
    response: livenessResponseSchema,
    errors: [],
  }),
  getReadiness: endpoint({
    method: 'GET',
    path: '/health/ready',
    auth: 'none',
    status: 200,
    response: readinessResponseSchema,
    errors: ['database_unavailable'],
  }),
  getOpenApi: endpoint({
    method: 'GET',
    path: '/openapi.json',
    auth: 'none',
    status: 200,
    response: openApiDocumentSchema,
    errors: [],
  }),
  signUp: endpoint({
    method: 'POST',
    path: '/users',
    auth: 'none',
    throttle: 'signup',
    body: signUpBodySchema,
    status: 201,
    response: meSchema,
    errors: ['email_taken'],
  }),
  logIn: endpoint({
    method: 'POST',
    path: '/sessions',
    auth: 'none',
    throttle: 'auth',
    body: logInBodySchema,
    status: 201,
    response: meSchema,
    errors: ['invalid_credentials', 'too_many_attempts'],
  }),
  logOut: endpoint({
    method: 'DELETE',
    path: '/sessions/current',
    auth: 'required',
    status: 204,
    errors: [],
  }),
  logOutEverywhere: endpoint({
    method: 'DELETE',
    path: '/sessions',
    auth: 'required',
    status: 204,
    errors: [],
  }),
  getMe: endpoint({
    method: 'GET',
    path: '/me',
    auth: 'required',
    status: 200,
    response: meSchema,
    errors: [],
  }),
  updateMe: endpoint({
    method: 'PATCH',
    path: '/me',
    auth: 'required',
    body: updateMeBodySchema,
    status: 200,
    response: meSchema,
    errors: [],
  }),
  changePassword: endpoint({
    method: 'PUT',
    path: '/me/password',
    auth: 'required',
    throttle: 'auth',
    body: changePasswordBodySchema,
    status: 204,
    errors: ['wrong_password'],
  }),
  deleteAccount: endpoint({
    method: 'DELETE',
    path: '/me',
    auth: 'required',
    throttle: 'auth',
    body: deleteAccountBodySchema,
    status: 204,
    errors: ['wrong_password'],
  }),
  listBlocks: endpoint({
    method: 'GET',
    path: '/me/blocks',
    auth: 'required',
    query: pageQuerySchema(PAGE_SIZES.blocks),
    status: 200,
    response: pageSchema(userCardSchema),
    errors: [],
  }),
  blockUser: endpoint({
    method: 'PUT',
    path: '/me/blocks/{userId}',
    auth: 'required',
    params: userParams,
    status: 204,
    errors: ['user_not_found', 'cannot_block_self'],
  }),
  unblockUser: endpoint({
    method: 'DELETE',
    path: '/me/blocks/{userId}',
    auth: 'required',
    params: userParams,
    status: 204,
    // 204 also when not blocked; only a malformed id answers 404.
    errors: ['user_not_found'],
  }),
  getUserProfile: endpoint({
    method: 'GET',
    path: '/users/{userId}',
    auth: 'optional',
    params: userParams,
    status: 200,
    response: userProfileSchema,
    errors: ['user_not_found'],
  }),
  listUserTrips: endpoint({
    method: 'GET',
    path: '/users/{userId}/trips',
    auth: 'optional',
    params: userParams,
    query: pageQuerySchema(PAGE_SIZES.userLists),
    status: 200,
    response: pageSchema(publicTripCardSchema),
    errors: ['user_not_found'],
  }),
  listUserReviews: endpoint({
    method: 'GET',
    path: '/users/{userId}/reviews',
    auth: 'optional',
    params: userParams,
    query: pageQuerySchema(PAGE_SIZES.userLists),
    status: 200,
    response: pageSchema(reviewSchema),
    errors: ['user_not_found'],
  }),
  listMyTrips: endpoint({
    method: 'GET',
    path: '/trips',
    auth: 'required',
    query: pageQuerySchema(PAGE_SIZES.trips),
    status: 200,
    response: pageSchema(myTripCardSchema),
    errors: [],
  }),
  createTrip: endpoint({
    method: 'POST',
    path: '/trips',
    auth: 'required',
    body: createTripBodySchema,
    status: 201,
    response: tripOwnerSchema,
    errors: ['limit_reached'],
  }),
  getTrip: endpoint({
    method: 'GET',
    path: '/trips/{tripId}',
    auth: 'optional',
    params: tripParams,
    status: 200,
    response: tripSchema,
    errors: ['trip_not_found'],
  }),
  updateTrip: endpoint({
    method: 'PATCH',
    path: '/trips/{tripId}',
    auth: 'required',
    params: tripParams,
    body: updateTripBodySchema,
    status: 200,
    response: tripOwnerSchema,
    errors: ['trip_not_found'],
  }),
  deleteTrip: endpoint({
    method: 'DELETE',
    path: '/trips/{tripId}',
    auth: 'required',
    params: tripParams,
    status: 204,
    errors: ['trip_not_found'],
  }),
  rotateShareToken: endpoint({
    method: 'PUT',
    path: '/trips/{tripId}/share-token',
    auth: 'required',
    params: tripParams,
    status: 200,
    response: shareTokenResponseSchema,
    errors: ['trip_not_found', 'trip_is_private'],
  }),
  getTripPlan: endpoint({
    method: 'GET',
    path: '/trips/{tripId}/plan',
    auth: 'optional',
    params: tripParams,
    status: 200,
    response: tripPlanSchema,
    errors: ['trip_not_found'],
  }),
  copyTrip: endpoint({
    method: 'POST',
    path: '/trips/{tripId}/copies',
    auth: 'required',
    params: tripParams,
    body: copyTripBodySchema,
    status: 201,
    response: tripOwnerSchema,
    errors: ['trip_not_found', 'limit_reached'],
  }),
  getSharedPlan: endpoint({
    method: 'GET',
    path: '/shared/{shareToken}/plan',
    auth: 'optional',
    params: sharedParams,
    status: 200,
    response: tripPlanViewerSchema,
    errors: ['trip_not_found'],
  }),
  getSharedDayRoute: endpoint({
    method: 'GET',
    path: '/shared/{shareToken}/days/{dayId}/route',
    auth: 'optional',
    throttle: 'route',
    params: sharedDayParams,
    query: routeQuerySchema,
    status: 200,
    response: dayRouteSchema,
    errors: ['trip_not_found', 'not_found'],
  }),
  copySharedTrip: endpoint({
    method: 'POST',
    path: '/shared/{shareToken}/copies',
    auth: 'required',
    params: sharedParams,
    body: copyTripBodySchema,
    status: 201,
    response: tripOwnerSchema,
    errors: ['trip_not_found', 'limit_reached'],
  }),
  addTripPlace: endpoint({
    method: 'POST',
    path: '/trips/{tripId}/places',
    auth: 'required',
    params: tripParams,
    body: addTripPlaceBodySchema,
    status: 201,
    response: addTripPlaceResponseSchema,
    errors: [
      'trip_not_found',
      'not_found',
      'place_already_in_trip',
      'limit_reached',
      'day_full',
      'geocoding_unavailable',
    ],
  }),
  updateTripPlace: endpoint({
    method: 'PATCH',
    path: '/trips/{tripId}/places/{tripPlaceId}',
    auth: 'required',
    params: tripPlaceParams,
    body: updateTripPlaceBodySchema,
    status: 200,
    response: updateTripPlaceResponseSchema,
    errors: ['trip_not_found', 'not_found', 'not_a_custom_place'],
  }),
  deleteTripPlace: endpoint({
    method: 'DELETE',
    path: '/trips/{tripId}/places/{tripPlaceId}',
    auth: 'required',
    params: tripPlaceParams,
    status: 200,
    response: planChangeSchema,
    errors: ['trip_not_found', 'not_found'],
  }),
  createDay: endpoint({
    method: 'POST',
    path: '/trips/{tripId}/days',
    auth: 'required',
    params: tripParams,
    body: createDayBodySchema,
    status: 201,
    response: createDayResponseSchema,
    errors: ['trip_not_found', 'limit_reached'],
  }),
  updateDay: endpoint({
    method: 'PATCH',
    path: '/trips/{tripId}/days/{dayId}',
    auth: 'required',
    params: dayParams,
    body: updateDayBodySchema,
    status: 200,
    response: planChangeSchema,
    errors: ['trip_not_found', 'not_found'],
  }),
  deleteDay: endpoint({
    method: 'DELETE',
    path: '/trips/{tripId}/days/{dayId}',
    auth: 'required',
    params: dayParams,
    status: 200,
    response: planChangeSchema,
    errors: ['trip_not_found', 'not_found'],
  }),
  addStop: endpoint({
    method: 'POST',
    path: '/trips/{tripId}/days/{dayId}/stops',
    auth: 'required',
    params: dayParams,
    body: addStopBodySchema,
    status: 201,
    response: addStopResponseSchema,
    errors: ['trip_not_found', 'not_found', 'day_full'],
  }),
  putStopOrder: endpoint({
    method: 'PUT',
    path: '/trips/{tripId}/days/{dayId}/stop-order',
    auth: 'required',
    params: dayParams,
    body: stopOrderBodySchema,
    status: 200,
    response: planChangeSchema,
    errors: ['trip_not_found', 'not_found', 'plan_changed'],
  }),
  putStopPlacement: endpoint({
    method: 'PUT',
    path: '/trips/{tripId}/stops/{stopId}/placement',
    auth: 'required',
    params: stopParams,
    body: stopPlacementBodySchema,
    status: 200,
    response: planChangeSchema,
    errors: ['trip_not_found', 'not_found', 'day_full'],
  }),
  updateStop: endpoint({
    method: 'PATCH',
    path: '/trips/{tripId}/stops/{stopId}',
    auth: 'required',
    params: stopParams,
    body: updateStopBodySchema,
    status: 200,
    response: planChangeSchema,
    errors: ['trip_not_found', 'not_found'],
  }),
  deleteStop: endpoint({
    method: 'DELETE',
    path: '/trips/{tripId}/stops/{stopId}',
    auth: 'required',
    params: stopParams,
    status: 200,
    response: planChangeSchema,
    errors: ['trip_not_found', 'not_found'],
  }),
  getDayRoute: endpoint({
    method: 'GET',
    path: '/trips/{tripId}/days/{dayId}/route',
    auth: 'optional',
    throttle: 'route',
    params: dayParams,
    query: routeQuerySchema,
    status: 200,
    response: dayRouteSchema,
    errors: ['trip_not_found', 'not_found'],
  }),
  getOrderSuggestion: endpoint({
    method: 'GET',
    path: '/trips/{tripId}/days/{dayId}/order-suggestion',
    auth: 'required',
    throttle: 'route',
    params: dayParams,
    query: orderSuggestionQuerySchema,
    status: 200,
    response: orderSuggestionSchema,
    errors: ['trip_not_found', 'not_found', 'too_few_stops'],
  }),
  searchPlaces: endpoint({
    method: 'GET',
    path: '/places/search',
    auth: 'required',
    throttle: 'search',
    query: searchPlacesQuerySchema,
    status: 200,
    response: placeResultsSchema,
    errors: ['geocoding_unavailable', 'geocoding_busy'],
  }),
  reversePlaces: endpoint({
    method: 'GET',
    path: '/places/reverse',
    auth: 'required',
    throttle: 'reverse',
    query: reverseQuerySchema,
    status: 200,
    response: placeResultsSchema,
    errors: ['geocoding_unavailable', 'geocoding_busy'],
  }),
  getPlace: endpoint({
    method: 'GET',
    path: '/places/{placeId}',
    auth: 'optional',
    params: placeParams,
    status: 200,
    response: placeDetailSchema,
    errors: ['place_not_found'],
  }),
  listPlaceReviews: endpoint({
    method: 'GET',
    path: '/places/{placeId}/reviews',
    auth: 'optional',
    params: placeParams,
    query: placeReviewsQuerySchema,
    status: 200,
    response: pageSchema(reviewSchema),
    errors: ['place_not_found'],
  }),
  putMyReview: endpoint({
    method: 'PUT',
    path: '/places/{placeId}/reviews/mine',
    auth: 'required',
    throttle: 'ugc',
    params: placeParams,
    body: putReviewBodySchema,
    status: 201,
    alternateStatus: 200,
    response: reviewSchema,
    errors: ['place_not_found'],
  }),
  deleteMyReview: endpoint({
    method: 'DELETE',
    path: '/places/{placeId}/reviews/mine',
    auth: 'required',
    params: placeParams,
    status: 204,
    errors: ['place_not_found'],
  }),
  listPublicTrips: endpoint({
    method: 'GET',
    path: '/public-trips',
    auth: 'optional',
    query: publicTripsQuerySchema,
    status: 200,
    response: pageSchema(publicTripCardSchema),
    errors: [],
  }),
  createReport: endpoint({
    method: 'POST',
    path: '/reports',
    auth: 'required',
    throttle: 'ugc',
    body: createReportBodySchema,
    status: 201,
    response: createdIdSchema,
    errors: ['not_found', 'already_reported', 'cannot_report_own'],
  }),
  listReports: endpoint({
    method: 'GET',
    path: '/moderation/reports',
    auth: 'moderator',
    query: reportStatusQuerySchema,
    status: 200,
    response: pageSchema(reportItemSchema),
    errors: ['forbidden'],
  }),
  decideReport: endpoint({
    method: 'PATCH',
    path: '/moderation/reports/{reportId}',
    auth: 'moderator',
    params: reportParams,
    body: moderationDecisionBodySchema,
    status: 200,
    response: reportItemSchema,
    errors: ['forbidden', 'not_found'],
  }),
} as const satisfies Record<string, EndpointDef>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

type InputPart = 'params' | 'query' | 'body';

/** What a handler receives: params, query and body after parsing (defaults applied, text cleaned). */
export type EndpointInput<E extends EndpointDef> = {
  [K in keyof E & InputPart]: E[K] extends z.ZodType ? z.output<E[K]> : never;
};

/** What a client sends: params, query and body before parsing (defaulted fields optional). */
export type EndpointRequest<E extends EndpointDef> = {
  [K in keyof E & InputPart]: E[K] extends z.ZodType ? z.input<E[K]> : never;
};

/** Success body; `undefined` for 204 endpoints. */
export type EndpointOutput<E extends EndpointDef> = E extends {
  response: infer R extends z.ZodType;
}
  ? z.output<R>
  : undefined;
