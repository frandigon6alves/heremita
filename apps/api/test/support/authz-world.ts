import type { EndpointName, PlaceKey, TripPlanOwner } from '@heremita/shared';
import request from 'supertest';
import { GAZETTEER } from '../../src/providers/fake/gazetteer.js';
import { WEB_ORIGIN, type TestApp } from './app.js';
import {
  addPlace,
  createTrip,
  createUser,
  getPlan,
  publishTrip,
  type TestAgent,
  type TestUser,
} from './factories.js';
import { callOk } from './http.js';
import { PENDING_ENDPOINTS } from './pending-endpoints.js';

/**
 * Who calls: `owner` owns every trip but `stranger`'s; `blocker` has blocked
 * `owner`; `moderator` has the moderator role.
 */
export type Actor = 'anonymous' | 'owner' | 'stranger' | 'blocker' | 'moderator';

/** The trips of the world: four of the owner's (one per visibility state) and one of the stranger's. */
export type TripKey = 'private' | 'public' | 'link' | 'hidden' | 'stranger';

/** Ids reachable from one trip. Child ids exist once the plan endpoints do (E24, E29). */
export interface TripRef {
  tripId: string;
  shareToken?: string;
  /** First day, its stops in order, and its first stop. */
  dayId?: string;
  dayStopIds?: string[];
  stopId?: string;
  /** Second day of the trip (private trip only). */
  otherDayId?: string;
  /** Trip place of the first stop. */
  tripPlaceId?: string;
  /** A trip place on no day. */
  ideaTripPlaceId?: string;
}

/** Ids of one trip's canonical places and its custom pin (private trip only). */
export interface PlaceRefs {
  placeId: string;
  secondPlaceId: string;
  customPlaceId: string;
}

/** Owner reviews: one published, one hidden by a moderator. */
export interface ReviewRefs {
  published: { placeId: string; reviewId: string };
  hidden: { placeId: string; reviewId: string };
}

const isPending = (name: EndpointName): boolean => PENDING_ENDPOINTS.includes(name);

/**
 * Gazetteer keys counted from the end of the list, which factory trips never
 * reach (they take keys from the start): 1 = the ideas, 2 = free for E29.
 */
export function spareGazetteerKey(fromEnd: 1 | 2): PlaceKey {
  const place = GAZETTEER.at(-fromEnd);
  if (!place) {
    throw new Error('The gazetteer is empty');
  }
  return place.key;
}

/** Trip, day and stop rows of a trip, to prove a rejected request changed nothing. */
export async function snapshotTrip(t: TestApp, tripId: string): Promise<unknown> {
  const [trip, days, stops, tripPlaces] = await Promise.all([
    t.prisma.trip.findUnique({ where: { id: tripId } }),
    t.prisma.day.findMany({ where: { tripId }, orderBy: { id: 'asc' } }),
    t.prisma.stop.findMany({ where: { day: { tripId } }, orderBy: { id: 'asc' } }),
    t.prisma.tripPlace.findMany({ where: { tripId }, orderBy: { id: 'asc' } }),
  ]);
  return { trip, days, stops, tripPlaces };
}

function memo<T>(build: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => {
    value ??= build();
    return value;
  };
}

function refOf(plan: TripPlanOwner, shareToken?: string): TripRef {
  const [day, otherDay] = plan.days;
  const scheduled = new Set(plan.days.flatMap((d) => d.stops.map((stop) => stop.tripPlaceId)));
  return {
    tripId: plan.trip.id,
    shareToken: shareToken ?? plan.trip.shareToken ?? undefined,
    dayId: day?.id,
    dayStopIds: day?.stops.map((stop) => stop.id),
    stopId: day?.stops[0]?.id,
    otherDayId: otherDay?.id,
    tripPlaceId: day?.stops[0]?.tripPlaceId,
    ideaTripPlaceId: plan.places.find((place) => !scheduled.has(place.id))?.id,
  };
}

/**
 * The data one authorisation-matrix row runs against, built lazily so a row
 * only needs the endpoints its own cases use. Each row gets its own world,
 * so a successful delete in one row never breaks another.
 */
export class AuthzWorld {
  constructor(readonly t: TestApp) {}

  /** Client of an actor: anonymous sends `Origin` too, so CSRF never hides a 401. */
  async client(actor: Actor): Promise<TestAgent> {
    if (actor === 'anonymous') {
      return this.anonymous();
    }
    return (await this.user(actor)).agent;
  }

  readonly anonymous = memo(() =>
    Promise.resolve(
      request
        .agent(this.t.app.getHttpServer())
        .set('Origin', WEB_ORIGIN)
        .set('X-Forwarded-For', this.t.nextIp()),
    ),
  );

  private readonly users: Record<Exclude<Actor, 'anonymous'>, () => Promise<TestUser>> = {
    owner: memo(() => createUser(this.t, { displayName: 'Owner' })),
    stranger: memo(() => createUser(this.t, { displayName: 'Stranger' })),
    moderator: memo(() => createUser(this.t, { displayName: 'Moderator', role: 'moderator' })),
    blocker: memo(async (): Promise<TestUser> => {
      const [blocker, owner] = await Promise.all([
        createUser(this.t, { displayName: 'Blocker' }),
        this.users.owner(),
      ]);
      await callOk(blocker.agent, 'blockUser', { params: { userId: owner.user.id } });
      return blocker;
    }),
  };

  user(actor: Exclude<Actor, 'anonymous'>): Promise<TestUser> {
    return this.users[actor]();
  }

  /**
   * Private: 2 days × 3 stops + an idea + a custom pin. Public, link, hidden
   * (public, then hidden by a moderator): 1 day × 2 stops. Stranger's: 1 day ×
   * 1 stop + an idea. Without E24/E29 the trips are bare (no child ids).
   */
  readonly trips = memo(async (): Promise<Record<TripKey, TripRef>> => {
    const [owner, stranger] = await Promise.all([this.user('owner'), this.user('stranger')]);
    const withPlan = !isPending('getTripPlan') && !isPending('addTripPlace');

    const build = async (
      agent: TestAgent,
      days: number,
      stopsPerDay: number,
      idea: boolean,
    ): Promise<TripRef> => {
      if (!withPlan) {
        const trip = await callOk(agent, 'createTrip', {
          body: { title: 'Bare trip', dayCount: days },
        });
        return { tripId: trip.id };
      }
      const plan = await createTrip(agent, { days, stopsPerDay });
      if (idea) {
        await addPlace(agent, plan.trip.id, spareGazetteerKey(1));
      }
      return refOf(await getPlan(agent, plan.trip.id));
    };
    const share = async (ref: TripRef, visibility: 'public' | 'link'): Promise<TripRef> => {
      const trip = await publishTrip(owner.agent, ref.tripId, visibility);
      return { ...ref, shareToken: trip.shareToken ?? undefined };
    };

    const hidden = await share(await build(owner.agent, 1, 2, false), 'public');
    await this.t.prisma.trip.update({
      where: { id: hidden.tripId },
      data: { moderationHiddenAt: this.t.clock.now() },
    });
    return {
      private: await build(owner.agent, 2, 3, true),
      public: await share(await build(owner.agent, 1, 2, false), 'public'),
      link: await share(await build(owner.agent, 1, 2, false), 'link'),
      hidden,
      stranger: await build(stranger.agent, 1, 1, true),
    };
  });

  /** Places of the owner's private trip. Needs E24 and E29. */
  readonly places = memo(async (): Promise<PlaceRefs> => {
    const [owner, trips] = await Promise.all([this.user('owner'), this.trips()]);
    const tripId = trips.private.tripId;
    const custom = await callOk(owner.agent, 'addTripPlace', {
      params: { tripId },
      body: { place: { type: 'custom', name: 'Our flat', location: { lng: -9.14, lat: 38.71 } } },
    });
    const plan = await callOk(owner.agent, 'getTripPlan', { params: { tripId } });
    const osm = plan.places.filter((place) => place.place.source === 'osm');
    const [first, second] = osm;
    if (!first || !second) {
      throw new Error('The private trip needs two OSM places');
    }
    return {
      placeId: first.place.id,
      secondPlaceId: second.place.id,
      customPlaceId: custom.tripPlace.place.id,
    };
  });

  /** A trip token that no longer opens anything: the old token after a rotation (E23). */
  readonly rotatedToken = memo(async (): Promise<string> => {
    const [owner, trips] = await Promise.all([this.user('owner'), this.trips()]);
    const before = trips.link.shareToken;
    if (!before) {
      throw new Error('The link trip has no share token');
    }
    const fresh = await callOk(owner.agent, 'rotateShareToken', {
      params: { tripId: trips.link.tripId },
    });
    trips.link.shareToken = fresh.shareToken;
    return before;
  });

  /** The token a trip keeps after its owner made it private again (E21). */
  readonly privatisedToken = memo(async (): Promise<string> => {
    const owner = await this.user('owner');
    const trip = await callOk(owner.agent, 'createTrip', { body: { title: 'Once shared' } });
    const shared = await publishTrip(owner.agent, trip.id, 'link');
    await callOk(owner.agent, 'updateTrip', {
      params: { tripId: trip.id },
      body: { visibility: 'private' },
    });
    if (!shared.shareToken) {
      throw new Error('A link trip has a share token');
    }
    return shared.shareToken;
  });

  /** The owner's reviews (E46); the second one hidden by a moderator. */
  readonly reviews = memo(async (): Promise<ReviewRefs> => {
    const [owner, places] = await Promise.all([this.user('owner'), this.places()]);
    const write = (placeId: string) =>
      callOk(owner.agent, 'putMyReview', {
        params: { placeId },
        body: { rating: 4, body: 'Worth the queue at opening time.', visitedMonth: '2026-10' },
      });
    const published = await write(places.placeId);
    const hidden = await write(places.secondPlaceId);
    await this.t.prisma.review.update({
      where: { id: hidden.id },
      data: { status: 'hidden', hiddenAt: this.t.clock.now() },
    });
    return {
      published: { placeId: places.placeId, reviewId: published.id },
      hidden: { placeId: places.secondPlaceId, reviewId: hidden.id },
    };
  });

  /** An open report by the stranger on the owner's public trip (written directly: E49 may not exist yet). */
  readonly reportId = memo(async (): Promise<string> => {
    const [stranger, trips] = await Promise.all([this.user('stranger'), this.trips()]);
    const report = await this.t.prisma.report.create({
      data: {
        reporterId: stranger.user.id,
        targetType: 'trip',
        tripId: trips.public.tripId,
        reason: 'spam',
      },
    });
    return report.id;
  });

  /** An id no row has. */
  readonly unknownId = '0190d3a4-0000-7000-8000-000000000000';
}
