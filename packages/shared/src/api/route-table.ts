// Method and path of every endpoint, without its schemas: what a client needs to
// call the API. `endpoints` binds zod schemas to each operation, so importing it
// pulls zod and every schema into the caller's bundle; the web app's fetch code
// and query keys import this table instead (`@heremita/shared/api-routes`).
// Types come from `endpoints` through `import type`, which leaves no runtime
// import; `route-table.test.ts` checks both tables stay equal.
import type { EndpointName, Endpoints } from './endpoints.js';

export interface ApiRoute<N extends EndpointName = EndpointName> {
  readonly name: N;
  readonly method: Endpoints[N]['method'];
  readonly path: Endpoints[N]['path'];
}

/** Names of the read-only endpoints, the only ones a server render may call. */
export type GetEndpointName = {
  [N in EndpointName]: Endpoints[N]['method'] extends 'GET' ? N : never;
}[EndpointName];

/** Every endpoint of `/api/v1`, keyed and named by its operation as in `endpoints`. */
export const apiRoutes = {
  getLiveness: { name: 'getLiveness', method: 'GET', path: '/health' },
  getReadiness: { name: 'getReadiness', method: 'GET', path: '/health/ready' },
  getOpenApi: { name: 'getOpenApi', method: 'GET', path: '/openapi.json' },
  signUp: { name: 'signUp', method: 'POST', path: '/users' },
  logIn: { name: 'logIn', method: 'POST', path: '/sessions' },
  logOut: { name: 'logOut', method: 'DELETE', path: '/sessions/current' },
  logOutEverywhere: { name: 'logOutEverywhere', method: 'DELETE', path: '/sessions' },
  getMe: { name: 'getMe', method: 'GET', path: '/me' },
  updateMe: { name: 'updateMe', method: 'PATCH', path: '/me' },
  changePassword: { name: 'changePassword', method: 'PUT', path: '/me/password' },
  deleteAccount: { name: 'deleteAccount', method: 'DELETE', path: '/me' },
  listBlocks: { name: 'listBlocks', method: 'GET', path: '/me/blocks' },
  blockUser: { name: 'blockUser', method: 'PUT', path: '/me/blocks/{userId}' },
  unblockUser: { name: 'unblockUser', method: 'DELETE', path: '/me/blocks/{userId}' },
  getUserProfile: { name: 'getUserProfile', method: 'GET', path: '/users/{userId}' },
  listUserTrips: { name: 'listUserTrips', method: 'GET', path: '/users/{userId}/trips' },
  listUserReviews: { name: 'listUserReviews', method: 'GET', path: '/users/{userId}/reviews' },
  listMyTrips: { name: 'listMyTrips', method: 'GET', path: '/trips' },
  createTrip: { name: 'createTrip', method: 'POST', path: '/trips' },
  getTrip: { name: 'getTrip', method: 'GET', path: '/trips/{tripId}' },
  updateTrip: { name: 'updateTrip', method: 'PATCH', path: '/trips/{tripId}' },
  deleteTrip: { name: 'deleteTrip', method: 'DELETE', path: '/trips/{tripId}' },
  rotateShareToken: {
    name: 'rotateShareToken',
    method: 'PUT',
    path: '/trips/{tripId}/share-token',
  },
  getTripPlan: { name: 'getTripPlan', method: 'GET', path: '/trips/{tripId}/plan' },
  copyTrip: { name: 'copyTrip', method: 'POST', path: '/trips/{tripId}/copies' },
  getSharedPlan: { name: 'getSharedPlan', method: 'GET', path: '/shared/{shareToken}/plan' },
  getSharedDayRoute: {
    name: 'getSharedDayRoute',
    method: 'GET',
    path: '/shared/{shareToken}/days/{dayId}/route',
  },
  copySharedTrip: { name: 'copySharedTrip', method: 'POST', path: '/shared/{shareToken}/copies' },
  addTripPlace: { name: 'addTripPlace', method: 'POST', path: '/trips/{tripId}/places' },
  updateTripPlace: {
    name: 'updateTripPlace',
    method: 'PATCH',
    path: '/trips/{tripId}/places/{tripPlaceId}',
  },
  deleteTripPlace: {
    name: 'deleteTripPlace',
    method: 'DELETE',
    path: '/trips/{tripId}/places/{tripPlaceId}',
  },
  createDay: { name: 'createDay', method: 'POST', path: '/trips/{tripId}/days' },
  updateDay: { name: 'updateDay', method: 'PATCH', path: '/trips/{tripId}/days/{dayId}' },
  deleteDay: { name: 'deleteDay', method: 'DELETE', path: '/trips/{tripId}/days/{dayId}' },
  addStop: { name: 'addStop', method: 'POST', path: '/trips/{tripId}/days/{dayId}/stops' },
  putStopOrder: {
    name: 'putStopOrder',
    method: 'PUT',
    path: '/trips/{tripId}/days/{dayId}/stop-order',
  },
  putStopPlacement: {
    name: 'putStopPlacement',
    method: 'PUT',
    path: '/trips/{tripId}/stops/{stopId}/placement',
  },
  updateStop: { name: 'updateStop', method: 'PATCH', path: '/trips/{tripId}/stops/{stopId}' },
  deleteStop: { name: 'deleteStop', method: 'DELETE', path: '/trips/{tripId}/stops/{stopId}' },
  getDayRoute: { name: 'getDayRoute', method: 'GET', path: '/trips/{tripId}/days/{dayId}/route' },
  getOrderSuggestion: {
    name: 'getOrderSuggestion',
    method: 'GET',
    path: '/trips/{tripId}/days/{dayId}/order-suggestion',
  },
  suggestPlaces: { name: 'suggestPlaces', method: 'POST', path: '/trips/{tripId}/suggestions' },
  searchPlaces: { name: 'searchPlaces', method: 'GET', path: '/places/search' },
  reversePlaces: { name: 'reversePlaces', method: 'GET', path: '/places/reverse' },
  getPlace: { name: 'getPlace', method: 'GET', path: '/places/{placeId}' },
  listPlaceReviews: { name: 'listPlaceReviews', method: 'GET', path: '/places/{placeId}/reviews' },
  putMyReview: { name: 'putMyReview', method: 'PUT', path: '/places/{placeId}/reviews/mine' },
  deleteMyReview: {
    name: 'deleteMyReview',
    method: 'DELETE',
    path: '/places/{placeId}/reviews/mine',
  },
  listPublicTrips: { name: 'listPublicTrips', method: 'GET', path: '/public-trips' },
  createReport: { name: 'createReport', method: 'POST', path: '/reports' },
  listReports: { name: 'listReports', method: 'GET', path: '/moderation/reports' },
  decideReport: { name: 'decideReport', method: 'PATCH', path: '/moderation/reports/{reportId}' },
} as const satisfies { [N in EndpointName]: ApiRoute<N> };
