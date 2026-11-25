import { endpoints, LIMITS, type EndpointName, type ErrorCode } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './support/app.js';
import {
  AuthzWorld,
  snapshotTrip,
  spareGazetteerKey,
  type Actor,
  type TripKey,
  type TripRef,
} from './support/authz-world.js';
import { FACTORY_PASSWORD } from './support/factories.js';
import { sendRaw, type RawRequest } from './support/http.js';
import { PENDING_ENDPOINTS } from './support/pending-endpoints.js';

type Build = (w: AuthzWorld) => Promise<RawRequest>;
type Snapshot = (w: AuthzWorld) => Promise<unknown>;
type IdOf = (w: AuthzWorld) => Promise<string>;

interface Expected {
  status: number;
  code?: ErrorCode;
  viewerRole?: 'owner' | 'viewer';
  itemCount?: number;
  /** Objects of the world that must (`in`) or must not (`out`) be among the listed items. */
  listed?: { in?: IdOf[]; out?: IdOf[] };
}

interface Case {
  actor: Actor;
  /** What the request addresses, for the test name. */
  on: string;
  request: Build;
  expected: Expected;
  /** Endpoints the world of this case is built with, besides the one under test. */
  needs?: readonly EndpointName[];
  /** Rows that a rejected request must leave as they were. */
  unchanged?: readonly Snapshot[];
  /** One user's trip addressed with a child id of another trip (V1 nested IDOR). */
  nested?: boolean;
}

const TRIPS: readonly EndpointName[] = ['createTrip', 'updateTrip'];
const PLAN: readonly EndpointName[] = [...TRIPS, 'getTripPlan', 'addTripPlace'];
const REVIEWS: readonly EndpointName[] = [...PLAN, 'putMyReview'];

const UNAUTHENTICATED: Expected = { status: 401, code: 'unauthenticated' };
const TRIP_NOT_FOUND: Expected = { status: 404, code: 'trip_not_found' };
const NOT_FOUND: Expected = { status: 404, code: 'not_found' };
const PLACE_NOT_FOUND: Expected = { status: 404, code: 'place_not_found' };
const FORBIDDEN: Expected = { status: 403, code: 'forbidden' };

const noInput: Build = () => Promise.resolve({});

type ChildField = 'dayId' | 'otherDayId' | 'stopId' | 'tripPlaceId' | 'ideaTripPlaceId';

function child(ref: TripRef, field: ChildField): string {
  const value = ref[field];
  if (value === undefined) {
    throw new Error(`The trip has no ${field}`);
  }
  return value;
}

const tripIdOf =
  (key: TripKey): IdOf =>
  async (w) =>
    (await w.trips())[key].tripId;

const reviewIdOf =
  (which: 'published' | 'hidden'): IdOf =>
  async (w) =>
    (await w.reviews())[which].reviewId;

const tripIdsOf = (...keys: TripKey[]): IdOf[] => keys.map(tripIdOf);

const tripRows = (...keys: TripKey[]): Snapshot[] =>
  keys.map((key) => async (w) => snapshotTrip(w.t, (await w.trips())[key].tripId));

const ownerReviews: Snapshot = async (w) => {
  const owner = await w.user('owner');
  return w.t.prisma.review.findMany({ where: { authorId: owner.user.id }, orderBy: { id: 'asc' } });
};

const userParams =
  (actor: Exclude<Actor, 'anonymous'>, extra: RawRequest = {}): Build =>
  async (w) => ({ ...extra, params: { userId: (await w.user(actor)).user.id } });

const unknownUser: Build = (w) => Promise.resolve({ params: { userId: w.unknownId } });

const onTrip =
  (body?: unknown, query?: Record<string, unknown>) =>
  (key: TripKey): Build =>
  async (w) => ({ params: { tripId: (await w.trips())[key].tripId }, body, query });

/** Anonymous 401; a stranger gets 404 on the owner's private and public trip, rows unchanged; the owner succeeds. */
function ownerTripCases(
  request: (key: TripKey) => Build,
  success: Expected,
  successOn: TripKey = 'private',
): Case[] {
  return [
    {
      actor: 'anonymous',
      on: 'private_trip',
      request: request('private'),
      expected: UNAUTHENTICATED,
      needs: TRIPS,
      unchanged: tripRows('private'),
    },
    {
      actor: 'stranger',
      on: 'private_trip',
      request: request('private'),
      expected: TRIP_NOT_FOUND,
      needs: TRIPS,
      unchanged: tripRows('private'),
    },
    {
      actor: 'stranger',
      on: 'public_trip',
      request: request('public'),
      expected: TRIP_NOT_FOUND,
      needs: TRIPS,
      unchanged: tripRows('public'),
    },
    {
      actor: 'owner',
      on: `${successOn}_trip`,
      request: request(successOn),
      expected: success,
      needs: TRIPS,
    },
  ];
}

/** `request(trip, childOf)`: the trip in the path and the trip the child ids come from. */
type ChildRequest = (trip: TripKey, childOf: TripKey) => Build;

/**
 * Anonymous 401; a stranger gets 404 on the owner's child; each user's trip
 * with the other's child id answers 404 and leaves both trips unchanged; the
 * owner succeeds.
 */
function childCases(request: ChildRequest, success: Expected): Case[] {
  return [
    {
      actor: 'anonymous',
      on: 'owners_child',
      request: request('private', 'private'),
      expected: UNAUTHENTICATED,
      needs: PLAN,
    },
    {
      actor: 'stranger',
      on: 'owners_trip_and_child',
      request: request('private', 'private'),
      expected: TRIP_NOT_FOUND,
      needs: PLAN,
      unchanged: tripRows('private'),
    },
    {
      actor: 'stranger',
      on: 'own_trip_with_owners_child',
      request: request('stranger', 'private'),
      expected: NOT_FOUND,
      needs: PLAN,
      unchanged: tripRows('private', 'stranger'),
      nested: true,
    },
    {
      actor: 'owner',
      on: 'own_trip_with_strangers_child',
      request: request('private', 'stranger'),
      expected: NOT_FOUND,
      needs: PLAN,
      unchanged: tripRows('private', 'stranger'),
      nested: true,
    },
    {
      actor: 'owner',
      on: 'own_child',
      request: request('private', 'private'),
      expected: success,
      needs: PLAN,
    },
  ];
}

const childRequest =
  (param: 'dayId' | 'stopId' | 'tripPlaceId', field: ChildField, body?: unknown): ChildRequest =>
  (trip, childOf) =>
  async (w) => {
    const trips = await w.trips();
    return {
      params: { tripId: trips[trip].tripId, [param]: child(trips[childOf], field) },
      body,
    };
  };

const READ_ACTORS = ['anonymous', 'stranger', 'owner'] as const;
const ID_READ_TRIPS: readonly TripKey[] = ['private', 'public', 'link', 'hidden'];

/** §I.authz trips by id: the owner always reads (owner shape); others only a public ¬hidden trip. */
function tripReadCases(
  request: (key: TripKey) => Build,
  needs: readonly EndpointName[],
  withRole: boolean,
): Case[] {
  return READ_ACTORS.flatMap((actor) =>
    ID_READ_TRIPS.map((key): Case => {
      const role = actor === 'owner' ? 'owner' : 'viewer';
      const readable = actor === 'owner' || key === 'public';
      return {
        actor,
        on: `${key}_trip`,
        request: request(key),
        expected: readable
          ? { status: 200, ...(withRole && { viewerRole: role }) }
          : TRIP_NOT_FOUND,
        needs,
      };
    }),
  );
}

type TokenKind = 'link' | 'public' | 'hidden' | 'rotated' | 'privatised';

async function tokenOf(w: AuthzWorld, kind: TokenKind): Promise<string> {
  if (kind === 'rotated') {
    return w.rotatedToken();
  }
  if (kind === 'privatised') {
    return w.privatisedToken();
  }
  const token = (await w.trips())[kind].shareToken;
  if (!token) {
    throw new Error(`The ${kind} trip has no share token`);
  }
  return token;
}

/** The trip whose days a token addresses. */
const TOKEN_TRIP: Record<TokenKind, TripKey> = {
  link: 'link',
  public: 'public',
  hidden: 'hidden',
  rotated: 'link',
  privatised: 'link',
};

const tokenNeeds = (kind: TokenKind): readonly EndpointName[] =>
  kind === 'rotated' ? [...TRIPS, 'rotateShareToken'] : TRIPS;

/** §I.authz trips by token: a valid token of a shared ¬hidden trip gives everyone the viewer shape, the owner included. */
function sharedReadCases(
  request: (kind: TokenKind) => Build,
  kinds: readonly TokenKind[],
  needs: readonly EndpointName[],
  withRole: boolean,
): Case[] {
  return READ_ACTORS.flatMap((actor) =>
    kinds.map((kind): Case => ({
      actor,
      on: `${kind}_token`,
      request: request(kind),
      expected:
        kind === 'link' || kind === 'public'
          ? { status: 200, ...(withRole && { viewerRole: 'viewer' }) }
          : TRIP_NOT_FOUND,
      needs: [...needs, ...tokenNeeds(kind)],
    })),
  );
}

const sharedDayRoute =
  (dayOf?: TripKey) =>
  (kind: TokenKind): Build =>
  async (w) => {
    const shareToken = await tokenOf(w, kind);
    const trips = await w.trips();
    return { params: { shareToken, dayId: child(trips[dayOf ?? TOKEN_TRIP[kind]], 'dayId') } };
  };

const copyShared =
  (kind: TokenKind): Build =>
  async (w) => ({ params: { shareToken: await tokenOf(w, kind) }, body: {} });

const placeOf =
  (which: 'placeId' | 'secondPlaceId' | 'customPlaceId', body?: unknown): Build =>
  async (w) => ({ params: { placeId: (await w.places())[which] }, body });

/** The place the owner reviewed in this world (its review written first). */
const reviewedPlace =
  (body?: unknown): Build =>
  async (w) => ({ params: { placeId: (await w.reviews()).published.placeId }, body });

/** Canonical places are shared by every world of the file, so their lists hold other rows' reviews too. */
const placeReviews =
  (which: 'placeId' | 'secondPlaceId'): Build =>
  async (w) => ({
    params: { placeId: (await w.places())[which] },
    query: { limit: String(LIMITS.PAGE_SIZES.reviews.max) },
  });

const REVIEW_BODY = { rating: 5, body: 'Quiet at dusk, worth the climb.', visitedMonth: '2026-09' };

const CUSTOM_PIN = { type: 'custom', name: 'Meeting point', location: { lng: -9.15, lat: 38.72 } };

const reportOn =
  (type: 'trip' | 'review', idOf: IdOf): Build =>
  async (w) => ({ body: { target: { type, id: await idOf(w) }, reason: 'spam' } });

/**
 * The §I.authz matrix, one row per endpoint of the contract. Within a row,
 * cases that end the caller's session or delete what later cases read come last.
 */
const MATRIX = {
  getLiveness: [{ actor: 'anonymous', on: 'service', request: noInput, expected: { status: 200 } }],
  getReadiness: [
    { actor: 'anonymous', on: 'service', request: noInput, expected: { status: 200 } },
  ],
  getOpenApi: [{ actor: 'anonymous', on: 'document', request: noInput, expected: { status: 200 } }],
  signUp: [
    {
      actor: 'anonymous',
      on: 'new_account',
      request: (w) =>
        Promise.resolve({
          body: {
            email: w.t.nextEmail(),
            password: FACTORY_PASSWORD,
            displayName: 'Newcomer',
            locale: 'en',
          },
        }),
      expected: { status: 201 },
    },
  ],
  logIn: [
    {
      actor: 'anonymous',
      on: 'own_account',
      request: async (w) => {
        const owner = await w.user('owner');
        return { body: { email: owner.email, password: owner.password } };
      },
      expected: { status: 201 },
    },
  ],
  logOut: [
    { actor: 'anonymous', on: 'session', request: noInput, expected: UNAUTHENTICATED },
    { actor: 'owner', on: 'own_session', request: noInput, expected: { status: 204 } },
  ],
  logOutEverywhere: [
    { actor: 'anonymous', on: 'sessions', request: noInput, expected: UNAUTHENTICATED },
    { actor: 'owner', on: 'own_sessions', request: noInput, expected: { status: 204 } },
  ],
  getMe: [
    { actor: 'anonymous', on: 'account', request: noInput, expected: UNAUTHENTICATED },
    { actor: 'owner', on: 'own_account', request: noInput, expected: { status: 200 } },
  ],
  updateMe: [
    {
      actor: 'anonymous',
      on: 'account',
      request: () => Promise.resolve({ body: { theme: 'dark' } }),
      expected: UNAUTHENTICATED,
    },
    {
      actor: 'owner',
      on: 'own_account',
      request: () => Promise.resolve({ body: { theme: 'dark' } }),
      expected: { status: 200 },
    },
  ],
  changePassword: [
    {
      actor: 'anonymous',
      on: 'account',
      request: () =>
        Promise.resolve({
          body: { currentPassword: FACTORY_PASSWORD, newPassword: 'another long passphrase' },
        }),
      expected: UNAUTHENTICATED,
    },
    {
      actor: 'owner',
      on: 'own_account',
      request: () =>
        Promise.resolve({
          body: { currentPassword: FACTORY_PASSWORD, newPassword: 'another long passphrase' },
        }),
      expected: { status: 204 },
    },
  ],
  deleteAccount: [
    {
      actor: 'anonymous',
      on: 'account',
      request: () => Promise.resolve({ body: { password: FACTORY_PASSWORD } }),
      expected: UNAUTHENTICATED,
    },
    {
      actor: 'owner',
      on: 'own_account',
      request: () => Promise.resolve({ body: { password: FACTORY_PASSWORD } }),
      expected: { status: 204 },
    },
  ],
  listBlocks: [
    { actor: 'anonymous', on: 'blocks', request: noInput, expected: UNAUTHENTICATED },
    {
      actor: 'blocker',
      on: 'own_blocks',
      request: noInput,
      expected: { status: 200, itemCount: 1 },
    },
    {
      actor: 'owner',
      on: 'own_blocks_while_blocked',
      request: async (w) => {
        await w.user('blocker');
        return {};
      },
      expected: { status: 200, itemCount: 0 },
      needs: ['blockUser'],
    },
  ],
  blockUser: [
    {
      actor: 'anonymous',
      on: 'owner',
      request: userParams('owner'),
      expected: UNAUTHENTICATED,
    },
    {
      actor: 'owner',
      on: 'self',
      request: userParams('owner'),
      expected: { status: 422, code: 'cannot_block_self' },
    },
    {
      actor: 'owner',
      on: 'unknown_user',
      request: unknownUser,
      expected: { status: 404, code: 'user_not_found' },
    },
    { actor: 'stranger', on: 'owner', request: userParams('owner'), expected: { status: 204 } },
  ],
  unblockUser: [
    {
      actor: 'anonymous',
      on: 'owner',
      request: userParams('owner'),
      expected: UNAUTHENTICATED,
    },
    { actor: 'blocker', on: 'owner', request: userParams('owner'), expected: { status: 204 } },
  ],
  getUserProfile: [
    { actor: 'anonymous', on: 'owner', request: userParams('owner'), expected: { status: 200 } },
    { actor: 'stranger', on: 'owner', request: userParams('owner'), expected: { status: 200 } },
    { actor: 'owner', on: 'self', request: userParams('owner'), expected: { status: 200 } },
    {
      actor: 'anonymous',
      on: 'unknown_user',
      request: unknownUser,
      expected: { status: 404, code: 'user_not_found' },
    },
  ],
  listUserTrips: [
    {
      actor: 'anonymous',
      on: 'owners_trips',
      request: userParams('owner'),
      expected: {
        status: 200,
        listed: { in: tripIdsOf('public'), out: tripIdsOf('private', 'link', 'hidden') },
      },
      needs: TRIPS,
    },
    {
      actor: 'stranger',
      on: 'owners_trips',
      request: userParams('owner'),
      expected: {
        status: 200,
        listed: { in: tripIdsOf('public'), out: tripIdsOf('private', 'link', 'hidden') },
      },
      needs: TRIPS,
    },
    {
      actor: 'owner',
      on: 'own_trips',
      request: userParams('owner'),
      expected: {
        status: 200,
        listed: { in: tripIdsOf('public'), out: tripIdsOf('private', 'link') },
      },
      needs: TRIPS,
    },
    {
      actor: 'blocker',
      on: 'blocked_authors_trips',
      request: userParams('owner'),
      expected: { status: 200, listed: { out: tripIdsOf('public') } },
      needs: TRIPS,
    },
    {
      actor: 'anonymous',
      on: 'unknown_user',
      request: unknownUser,
      expected: { status: 404, code: 'user_not_found' },
    },
  ],
  listUserReviews: [
    {
      actor: 'anonymous',
      on: 'owners_reviews',
      request: userParams('owner'),
      expected: {
        status: 200,
        listed: { in: [reviewIdOf('published')], out: [reviewIdOf('hidden')] },
      },
      needs: REVIEWS,
    },
    {
      actor: 'stranger',
      on: 'owners_reviews',
      request: userParams('owner'),
      expected: {
        status: 200,
        listed: { in: [reviewIdOf('published')], out: [reviewIdOf('hidden')] },
      },
      needs: REVIEWS,
    },
    {
      actor: 'owner',
      on: 'own_reviews_with_the_hidden_one',
      request: userParams('owner'),
      expected: { status: 200, listed: { in: [reviewIdOf('published'), reviewIdOf('hidden')] } },
      needs: REVIEWS,
    },
    {
      actor: 'blocker',
      on: 'blocked_authors_reviews',
      request: userParams('owner'),
      expected: { status: 200, listed: { out: [reviewIdOf('published')] } },
      needs: REVIEWS,
    },
    {
      actor: 'anonymous',
      on: 'unknown_user',
      request: unknownUser,
      expected: { status: 404, code: 'user_not_found' },
    },
  ],
  listMyTrips: [
    { actor: 'anonymous', on: 'trips', request: noInput, expected: UNAUTHENTICATED },
    {
      actor: 'owner',
      on: 'own_trips',
      request: noInput,
      expected: {
        status: 200,
        listed: {
          in: tripIdsOf('private', 'public', 'link', 'hidden'),
          out: tripIdsOf('stranger'),
        },
      },
      needs: TRIPS,
    },
    {
      actor: 'stranger',
      on: 'own_trips',
      request: noInput,
      expected: {
        status: 200,
        listed: { in: tripIdsOf('stranger'), out: tripIdsOf('private', 'public') },
      },
      needs: TRIPS,
    },
  ],
  createTrip: [
    {
      actor: 'anonymous',
      on: 'new_trip',
      request: () => Promise.resolve({ body: { title: 'Weekend away' } }),
      expected: UNAUTHENTICATED,
    },
    {
      actor: 'owner',
      on: 'new_trip',
      request: () => Promise.resolve({ body: { title: 'Weekend away' } }),
      expected: { status: 201 },
    },
  ],
  getTrip: tripReadCases(onTrip(), TRIPS, true),
  updateTrip: ownerTripCases(onTrip({ title: 'Renamed trip' }), {
    status: 200,
    viewerRole: 'owner',
  }),
  deleteTrip: ownerTripCases(onTrip(), { status: 204 }),
  rotateShareToken: [
    ...ownerTripCases(onTrip(), { status: 200 }, 'link'),
    {
      actor: 'owner',
      on: 'own_private_trip',
      request: onTrip()('private'),
      expected: { status: 409, code: 'trip_is_private' },
      needs: TRIPS,
    },
  ],
  getTripPlan: tripReadCases(onTrip(), TRIPS, true),
  copyTrip: [
    {
      actor: 'anonymous',
      on: 'public_trip',
      request: onTrip({})('public'),
      expected: UNAUTHENTICATED,
      needs: TRIPS,
    },
    ...(['private', 'link', 'hidden'] as const).map((key): Case => ({
      actor: 'stranger',
      on: `${key}_trip`,
      request: onTrip({})(key),
      expected: TRIP_NOT_FOUND,
      needs: TRIPS,
    })),
    {
      actor: 'stranger',
      on: 'public_trip',
      request: onTrip({})('public'),
      expected: { status: 201 },
      needs: TRIPS,
    },
    {
      actor: 'owner',
      on: 'own_private_trip',
      request: onTrip({})('private'),
      expected: { status: 201 },
      needs: TRIPS,
    },
  ],
  getSharedPlan: sharedReadCases(
    (kind) => async (w) => ({ params: { shareToken: await tokenOf(w, kind) } }),
    ['link', 'public', 'hidden', 'rotated', 'privatised'],
    [],
    true,
  ),
  getSharedDayRoute: [
    ...sharedReadCases(sharedDayRoute(), ['link', 'hidden', 'rotated', 'privatised'], PLAN, false),
    {
      actor: 'anonymous',
      on: 'link_token_with_private_trips_day',
      request: sharedDayRoute('private')('link'),
      expected: NOT_FOUND,
      needs: PLAN,
      nested: true,
    },
    {
      actor: 'stranger',
      on: 'link_token_with_own_trips_day',
      request: sharedDayRoute('stranger')('link'),
      expected: NOT_FOUND,
      needs: PLAN,
      nested: true,
    },
  ],
  copySharedTrip: [
    {
      actor: 'anonymous',
      on: 'link_token',
      request: copyShared('link'),
      expected: UNAUTHENTICATED,
      needs: TRIPS,
    },
    ...(['hidden', 'rotated', 'privatised'] as const).map((kind): Case => ({
      actor: 'stranger',
      on: `${kind}_token`,
      request: copyShared(kind),
      expected: TRIP_NOT_FOUND,
      needs: tokenNeeds(kind),
    })),
    {
      actor: 'stranger',
      on: 'link_token',
      request: copyShared('link'),
      expected: { status: 201 },
      needs: TRIPS,
    },
    {
      actor: 'owner',
      on: 'link_token',
      request: copyShared('link'),
      expected: { status: 201 },
      needs: TRIPS,
    },
  ],
  addTripPlace: [
    ...ownerTripCases(onTrip({ place: { type: 'osm', key: spareGazetteerKey(2) } }), {
      status: 201,
    }),
    ...(
      [
        ['stranger', 'stranger', 'private'],
        ['owner', 'private', 'stranger'],
      ] as const
    ).map(([actor, trip, dayOf]): Case => ({
      actor,
      on: `own_trip_scheduled_on_${dayOf === 'private' ? 'owners' : 'strangers'}_day`,
      request: async (w) => {
        const trips = await w.trips();
        return {
          params: { tripId: trips[trip].tripId },
          body: { place: CUSTOM_PIN, schedule: { dayId: child(trips[dayOf], 'dayId') } },
        };
      },
      expected: NOT_FOUND,
      needs: PLAN,
      unchanged: tripRows('private', 'stranger'),
      nested: true,
    })),
  ],
  updateTripPlace: childCases(childRequest('tripPlaceId', 'tripPlaceId', { note: 'Bring cash' }), {
    status: 200,
  }),
  deleteTripPlace: childCases(childRequest('tripPlaceId', 'ideaTripPlaceId'), { status: 200 }),
  createDay: ownerTripCases(onTrip({}), { status: 201 }),
  updateDay: childCases(childRequest('dayId', 'dayId', { modeOverride: 'bike' }), {
    status: 200,
  }),
  deleteDay: childCases(childRequest('dayId', 'dayId'), { status: 200 }),
  addStop: [
    ...childCases(
      (trip, childOf) => async (w) => {
        const trips = await w.trips();
        return {
          params: { tripId: trips[trip].tripId, dayId: child(trips[childOf], 'dayId') },
          body: { tripPlaceId: child(trips[trip], 'ideaTripPlaceId') },
        };
      },
      { status: 201 },
    ),
    {
      actor: 'stranger',
      on: 'own_day_with_owners_trip_place',
      request: async (w) => {
        const trips = await w.trips();
        return {
          params: { tripId: trips.stranger.tripId, dayId: child(trips.stranger, 'dayId') },
          body: { tripPlaceId: child(trips.private, 'ideaTripPlaceId') },
        };
      },
      expected: NOT_FOUND,
      needs: PLAN,
      unchanged: tripRows('private', 'stranger'),
      nested: true,
    },
  ],
  putStopOrder: childCases(
    (trip, childOf) => async (w) => {
      const trips = await w.trips();
      const stopIds = trips[childOf].dayStopIds ?? [];
      return {
        params: { tripId: trips[trip].tripId, dayId: child(trips[childOf], 'dayId') },
        body: { stopIds: stopIds.toReversed() },
      };
    },
    { status: 200 },
  ),
  putStopPlacement: [
    ...childCases(
      (trip, childOf) => async (w) => {
        const trips = await w.trips();
        const target = trips[trip].otherDayId ?? child(trips[trip], 'dayId');
        return {
          params: { tripId: trips[trip].tripId, stopId: child(trips[childOf], 'stopId') },
          body: { dayId: target, index: 0 },
        };
      },
      { status: 200 },
    ),
    {
      actor: 'stranger',
      on: 'own_stop_to_owners_day',
      request: async (w) => {
        const trips = await w.trips();
        return {
          params: { tripId: trips.stranger.tripId, stopId: child(trips.stranger, 'stopId') },
          body: { dayId: child(trips.private, 'dayId'), index: 0 },
        };
      },
      expected: NOT_FOUND,
      needs: PLAN,
      unchanged: tripRows('private', 'stranger'),
      nested: true,
    },
  ],
  updateStop: childCases(childRequest('stopId', 'stopId', { modeToNext: 'bike' }), {
    status: 200,
  }),
  deleteStop: childCases(childRequest('stopId', 'stopId'), { status: 200 }),
  getDayRoute: [
    ...tripReadCases((key) => childRequest('dayId', 'dayId')(key, key), PLAN, false),
    {
      actor: 'anonymous',
      on: 'public_trip_with_private_trips_day',
      request: childRequest('dayId', 'dayId')('public', 'private'),
      expected: NOT_FOUND,
      needs: PLAN,
      nested: true,
    },
    {
      actor: 'owner',
      on: 'own_trip_with_strangers_day',
      request: childRequest('dayId', 'dayId')('private', 'stranger'),
      expected: NOT_FOUND,
      needs: PLAN,
      nested: true,
    },
  ],
  getOrderSuggestion: childCases(childRequest('dayId', 'dayId'), { status: 200 }),
  suggestPlaces: ownerTripCases(
    onTrip({ prompt: 'Museums and viewpoints', locale: 'en', count: 2 }),
    { status: 200 },
  ),
  searchPlaces: [
    {
      actor: 'anonymous',
      on: 'query',
      request: () => Promise.resolve({ query: { q: 'Lisboa', locale: 'pt-BR' } }),
      expected: UNAUTHENTICATED,
    },
    {
      actor: 'owner',
      on: 'query',
      request: () => Promise.resolve({ query: { q: 'Lisboa', locale: 'pt-BR' } }),
      expected: { status: 200 },
    },
  ],
  reversePlaces: [
    {
      actor: 'anonymous',
      on: 'point',
      request: () => Promise.resolve({ query: { lng: '-9.1393', lat: '38.7223', locale: 'en' } }),
      expected: UNAUTHENTICATED,
    },
    {
      actor: 'owner',
      on: 'point',
      request: () => Promise.resolve({ query: { lng: '-9.1393', lat: '38.7223', locale: 'en' } }),
      expected: { status: 200 },
    },
  ],
  getPlace: [
    {
      actor: 'anonymous',
      on: 'osm_place',
      request: placeOf('placeId'),
      expected: { status: 200 },
      needs: PLAN,
    },
    {
      actor: 'stranger',
      on: 'osm_place',
      request: placeOf('placeId'),
      expected: { status: 200 },
      needs: PLAN,
    },
    ...READ_ACTORS.map((actor): Case => ({
      actor,
      on: 'custom_place',
      request: placeOf('customPlaceId'),
      expected: PLACE_NOT_FOUND,
      needs: PLAN,
    })),
  ],
  listPlaceReviews: [
    {
      actor: 'anonymous',
      on: 'place_with_a_published_review',
      request: placeReviews('placeId'),
      expected: { status: 200, listed: { in: [reviewIdOf('published')] } },
      needs: REVIEWS,
    },
    {
      actor: 'anonymous',
      on: 'place_with_a_hidden_review',
      request: placeReviews('secondPlaceId'),
      expected: { status: 200, listed: { out: [reviewIdOf('hidden')] } },
      needs: REVIEWS,
    },
    {
      actor: 'stranger',
      on: 'place_with_a_hidden_review',
      request: placeReviews('secondPlaceId'),
      expected: { status: 200, listed: { out: [reviewIdOf('hidden')] } },
      needs: REVIEWS,
    },
    {
      actor: 'owner',
      on: 'place_with_own_hidden_review',
      request: placeReviews('secondPlaceId'),
      expected: { status: 200, listed: { in: [reviewIdOf('hidden')] } },
      needs: REVIEWS,
    },
    {
      actor: 'blocker',
      on: 'place_reviewed_by_blocked_author',
      request: placeReviews('placeId'),
      expected: { status: 200, listed: { out: [reviewIdOf('published')] } },
      needs: REVIEWS,
    },
    ...READ_ACTORS.map((actor): Case => ({
      actor,
      on: 'custom_place',
      request: placeOf('customPlaceId'),
      expected: PLACE_NOT_FOUND,
      needs: PLAN,
    })),
  ],
  putMyReview: [
    {
      actor: 'anonymous',
      on: 'osm_place',
      request: placeOf('placeId', REVIEW_BODY),
      expected: UNAUTHENTICATED,
      needs: PLAN,
    },
    {
      actor: 'owner',
      on: 'custom_place',
      request: placeOf('customPlaceId', REVIEW_BODY),
      expected: PLACE_NOT_FOUND,
      needs: PLAN,
    },
    {
      actor: 'stranger',
      on: 'place_the_owner_reviewed',
      request: reviewedPlace(REVIEW_BODY),
      expected: { status: 201 },
      needs: REVIEWS,
      unchanged: [ownerReviews],
    },
    {
      actor: 'owner',
      on: 'own_reviewed_place',
      request: reviewedPlace(REVIEW_BODY),
      expected: { status: 200 },
      needs: REVIEWS,
    },
  ],
  deleteMyReview: [
    {
      actor: 'anonymous',
      on: 'osm_place',
      request: placeOf('placeId'),
      expected: UNAUTHENTICATED,
      needs: PLAN,
    },
    {
      actor: 'owner',
      on: 'custom_place',
      request: placeOf('customPlaceId'),
      expected: PLACE_NOT_FOUND,
      needs: PLAN,
    },
    {
      actor: 'stranger',
      on: 'place_the_owner_reviewed',
      request: reviewedPlace(),
      expected: { status: 204 },
      needs: REVIEWS,
      unchanged: [ownerReviews],
    },
    {
      actor: 'owner',
      on: 'own_reviewed_place',
      request: reviewedPlace(),
      expected: { status: 204 },
      needs: REVIEWS,
    },
  ],
  listPublicTrips: [
    ...(['anonymous', 'stranger'] as const).map((actor): Case => ({
      actor,
      on: 'public_trips',
      request: () =>
        Promise.resolve({ query: { limit: String(LIMITS.PAGE_SIZES.publicTrips.max) } }),
      expected: {
        status: 200,
        listed: {
          in: tripIdsOf('public'),
          out: tripIdsOf('private', 'link', 'hidden', 'stranger'),
        },
      },
      needs: TRIPS,
    })),
    {
      actor: 'blocker',
      on: 'public_trips_of_blocked_author',
      request: () =>
        Promise.resolve({ query: { limit: String(LIMITS.PAGE_SIZES.publicTrips.max) } }),
      expected: { status: 200, listed: { out: tripIdsOf('public') } },
      needs: TRIPS,
    },
  ],
  createReport: [
    {
      actor: 'anonymous',
      on: 'public_trip',
      request: reportOn('trip', tripIdOf('public')),
      expected: UNAUTHENTICATED,
      needs: TRIPS,
    },
    {
      actor: 'stranger',
      on: 'private_trip',
      request: reportOn('trip', tripIdOf('private')),
      expected: NOT_FOUND,
      needs: TRIPS,
    },
    {
      actor: 'stranger',
      on: 'hidden_trip',
      request: reportOn('trip', tripIdOf('hidden')),
      expected: NOT_FOUND,
      needs: TRIPS,
    },
    {
      actor: 'stranger',
      on: 'hidden_review',
      request: reportOn('review', reviewIdOf('hidden')),
      expected: NOT_FOUND,
      needs: REVIEWS,
    },
    {
      actor: 'owner',
      on: 'own_public_trip',
      request: reportOn('trip', tripIdOf('public')),
      expected: { status: 422, code: 'cannot_report_own' },
      needs: TRIPS,
    },
    {
      actor: 'owner',
      on: 'own_review',
      request: reportOn('review', reviewIdOf('published')),
      expected: { status: 422, code: 'cannot_report_own' },
      needs: REVIEWS,
    },
    {
      actor: 'stranger',
      on: 'public_trip',
      request: reportOn('trip', tripIdOf('public')),
      expected: { status: 201 },
      needs: TRIPS,
    },
    {
      actor: 'stranger',
      on: 'published_review',
      request: reportOn('review', reviewIdOf('published')),
      expected: { status: 201 },
      needs: REVIEWS,
    },
  ],
  listReports: [
    { actor: 'anonymous', on: 'queue', request: noInput, expected: UNAUTHENTICATED },
    { actor: 'owner', on: 'queue', request: noInput, expected: FORBIDDEN },
    {
      actor: 'moderator',
      on: 'queue',
      request: () =>
        Promise.resolve({ query: { limit: String(LIMITS.PAGE_SIZES.moderation.max) } }),
      expected: { status: 200, listed: { in: [(w) => w.reportId()] } },
      needs: TRIPS,
    },
  ],
  decideReport: [
    {
      actor: 'anonymous',
      on: 'open_report',
      request: async (w) => ({
        params: { reportId: await w.reportId() },
        body: { decision: 'dismiss' },
      }),
      expected: UNAUTHENTICATED,
      needs: TRIPS,
    },
    {
      actor: 'stranger',
      on: 'own_report',
      request: async (w) => ({
        params: { reportId: await w.reportId() },
        body: { decision: 'dismiss' },
      }),
      expected: FORBIDDEN,
      needs: TRIPS,
    },
    {
      actor: 'moderator',
      on: 'unknown_report',
      request: (w) =>
        Promise.resolve({ params: { reportId: w.unknownId }, body: { decision: 'dismiss' } }),
      expected: NOT_FOUND,
    },
    {
      actor: 'moderator',
      on: 'open_report',
      request: async (w) => ({
        params: { reportId: await w.reportId() },
        body: { decision: 'dismiss' },
      }),
      expected: { status: 200 },
      needs: TRIPS,
    },
  ],
} satisfies Record<EndpointName, readonly Case[]>;

const ROWS = Object.entries(MATRIX) as [EndpointName, readonly Case[]][];

const isPending = (name: EndpointName): boolean => PENDING_ENDPOINTS.includes(name);

function runnable(name: EndpointName, testCase: Case): boolean {
  const needs = [
    ...(testCase.needs ?? []),
    ...(testCase.actor === 'blocker' ? ['blockUser' as const] : []),
  ];
  return !isPending(name) && !needs.some(isPending);
}

function titleOf(testCase: Case): string {
  const { status, code } = testCase.expected;
  return [testCase.actor, 'on', testCase.on, 'answers', status, code].filter(Boolean).join('_');
}

interface Listed {
  in: string[];
  out: string[];
}

/** Resolved before the request, so the listed objects exist when the list is read. */
async function listedIds(w: AuthzWorld, expected: Expected): Promise<Listed> {
  const resolve = (ids: IdOf[] = []) => Promise.all(ids.map((idOf) => idOf(w)));
  return { in: await resolve(expected.listed?.in), out: await resolve(expected.listed?.out) };
}

function expectOutcome(
  response: { status: number; body: unknown },
  expected: Expected,
  listed: Listed,
): void {
  const body = response.body as Partial<{
    code: string;
    viewerRole: string;
    items: { id: string }[];
  }>;
  expect(
    { status: response.status, code: response.status >= 400 ? body.code : undefined },
    JSON.stringify(response.body),
  ).toEqual({ status: expected.status, code: expected.code });
  if (expected.viewerRole) {
    expect(body.viewerRole).toBe(expected.viewerRole);
  }
  if (expected.itemCount !== undefined) {
    expect(body.items).toHaveLength(expected.itemCount);
  }
  const ids = (body.items ?? []).map((item) => item.id);
  for (const id of listed.in) {
    expect(ids).toContain(id);
  }
  for (const id of listed.out) {
    expect(ids).not.toContain(id);
  }
}

describe('authorisation matrix', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  for (const [name, cases] of ROWS) {
    describe(name, () => {
      let world: AuthzWorld | undefined;
      const worldOf = (): AuthzWorld => {
        world ??= new AuthzWorld(t);
        return world;
      };

      for (const testCase of cases) {
        if (!runnable(name, testCase)) {
          it.todo(titleOf(testCase));
          continue;
        }
        it(titleOf(testCase), async () => {
          const w = worldOf();
          const request = await testCase.request(w);
          const client = await w.client(testCase.actor);
          const snapshots = testCase.unchanged ?? [];
          const listed = await listedIds(w, testCase.expected);
          const before = await Promise.all(snapshots.map((snapshot) => snapshot(w)));

          const response = await sendRaw(client, endpoints[name], request);

          expectOutcome(response, testCase.expected, listed);
          const after = await Promise.all(snapshots.map((snapshot) => snapshot(w)));
          expect(after).toEqual(before);
        });
      }
    });
  }
});

describe('authorisation matrix completeness', () => {
  const pathOf = (name: EndpointName): string => endpoints[name].path;

  it('has_a_row_for_every_endpoint_of_the_contract', () => {
    expect(Object.keys(MATRIX).sort()).toEqual(Object.keys(endpoints).sort());
  });

  it('gives_every_endpoint_at_least_one_case', () => {
    const empty = ROWS.filter(([, cases]) => cases.length === 0).map(([name]) => name);

    expect(empty).toEqual([]);
  });

  it('rejects_anonymous_callers_of_every_endpoint_that_needs_a_session', () => {
    const missing = ROWS.filter(([name]) =>
      ['required', 'moderator'].includes(endpoints[name].auth),
    )
      .filter(
        ([, cases]) => !cases.some((c) => c.actor === 'anonymous' && c.expected.status === 401),
      )
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it('answers_404_to_a_non_owner_on_every_endpoint_addressing_a_trip_by_id', () => {
    const missing = ROWS.filter(([name]) => pathOf(name).includes('{tripId}'))
      .filter(
        ([, cases]) =>
          !cases.some(
            (c) =>
              c.actor !== 'owner' &&
              c.actor !== 'anonymous' &&
              c.expected.code === 'trip_not_found',
          ),
      )
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it('crosses_trip_and_child_ids_on_every_endpoint_addressing_a_day_stop_or_trip_place', () => {
    const missing = ROWS.filter(([name]) => /\{(dayId|stopId|tripPlaceId)\}/.test(pathOf(name)))
      .filter(([, cases]) => cases.filter((c) => c.nested && c.expected.status === 404).length < 2)
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it('forbids_signed_in_non_moderators_on_every_moderation_endpoint', () => {
    const missing = ROWS.filter(([name]) => endpoints[name].auth === 'moderator')
      .filter(
        ([, cases]) =>
          !cases.some(
            (c) =>
              c.actor !== 'moderator' && c.actor !== 'anonymous' && c.expected.code === 'forbidden',
          ),
      )
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });
});
