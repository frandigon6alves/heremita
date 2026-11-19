import type {
  AddTripPlaceResponse,
  Me,
  PlaceKey,
  SignUpBody,
  TripOwner,
  TripPlanOwner,
  UserRole,
  Visibility,
} from '@heremita/shared';
import request from 'supertest';
import { GAZETTEER } from '../../src/providers/fake/gazetteer.js';
import { WEB_ORIGIN, type TestApp } from './app.js';
import { callOk, UnexpectedResponseError } from './http.js';

/** Password of every factory user unless overridden: long enough, not on the blocklist. */
export const FACTORY_PASSWORD = 'correct horse battery';

export type TestAgent = ReturnType<typeof request.agent>;

export interface TestUser {
  user: Me;
  /** `name=value` of the session cookie, for a `Cookie` header on a plain client. */
  cookie: string;
  /**
   * Client signed in as this user: keeps the session cookie, sends
   * `Origin: WEB_ORIGIN` and an `X-Forwarded-For` address of its own.
   */
  agent: TestAgent;
  email: string;
  password: string;
}

export interface UserOverrides extends Partial<SignUpBody> {
  /** Moderators exist through SQL only (no endpoint grants the role). */
  role?: UserRole;
}

/** Signs up a fresh user (E4) and returns a client signed in as them. */
export async function createUser(app: TestApp, overrides: UserOverrides = {}): Promise<TestUser> {
  const { role, ...body } = overrides;
  const signUp = {
    email: app.nextEmail(),
    password: FACTORY_PASSWORD,
    displayName: 'Test Traveller',
    locale: 'pt-BR',
    ...body,
  } satisfies SignUpBody;
  const agent = request
    .agent(app.app.getHttpServer())
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', app.nextIp());

  const response = await agent.post('/api/v1/users').send(signUp);
  if (response.status !== 201) {
    throw new UnexpectedResponseError(
      `signUp answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  let user = response.body as Me;
  if (role && role !== user.role) {
    await app.prisma.user.update({ where: { id: user.id }, data: { role } });
    user = await callOk(agent, 'getMe', {});
  }
  return {
    user,
    cookie: sessionCookieOf(response),
    agent,
    email: signUp.email,
    password: signUp.password,
  };
}

function sessionCookieOf(response: request.Response): string {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : [header ?? ''];
  const session = cookies.find((value) => /^(__Host-)?hm_session=/.test(value));
  if (!session) {
    throw new UnexpectedResponseError(`No session cookie in response ${response.status}`);
  }
  return session.split(';', 1)[0] ?? '';
}

/** Gazetteer keys in a fixed order, so every trip a factory builds holds distinct places. */
const PLACE_KEYS: readonly PlaceKey[] = GAZETTEER.map((place) => place.key);

export interface TripShape {
  days?: number;
  stopsPerDay?: number;
  title?: string;
}

/**
 * Creates a trip (E19) with `days` days and `stopsPerDay` distinct gazetteer
 * places scheduled on each (E29), and returns its owner plan (E24).
 */
export async function createTrip(agent: TestAgent, shape: TripShape = {}): Promise<TripPlanOwner> {
  const { days = 1, stopsPerDay = 0, title = 'Test trip' } = shape;
  if (days * stopsPerDay > PLACE_KEYS.length) {
    throw new RangeError(`The gazetteer holds ${PLACE_KEYS.length} places`);
  }
  const trip: TripOwner = await callOk(agent, 'createTrip', { body: { title, dayCount: days } });
  if (stopsPerDay > 0) {
    const plan = await getPlan(agent, trip.id);
    for (const [index, day] of plan.days.entries()) {
      const keys = PLACE_KEYS.slice(index * stopsPerDay, (index + 1) * stopsPerDay);
      for (const key of keys) {
        await addPlace(agent, trip.id, key, day.id);
      }
    }
  }
  return getPlan(agent, trip.id);
}

/** Adds a gazetteer place to a trip (E29): an idea, or appended to `dayId` when given. */
export function addPlace(
  agent: TestAgent,
  tripId: string,
  gazetteerKey: PlaceKey,
  dayId?: string,
): Promise<AddTripPlaceResponse> {
  return callOk(agent, 'addTripPlace', {
    params: { tripId },
    body: {
      place: { type: 'osm', key: gazetteerKey },
      schedule: dayId === undefined ? null : { dayId },
    },
  });
}

/** Makes a trip `public` (default) or `link`-shared (E21); the answer carries the share token. */
export function publishTrip(
  agent: TestAgent,
  tripId: string,
  visibility: Exclude<Visibility, 'private'> = 'public',
): Promise<TripOwner> {
  return callOk(agent, 'updateTrip', { params: { tripId }, body: { visibility } });
}

/** The owner plan of a trip (E24). */
export async function getPlan(agent: TestAgent, tripId: string): Promise<TripPlanOwner> {
  const plan = await callOk(agent, 'getTripPlan', { params: { tripId } });
  if (plan.viewerRole !== 'owner') {
    throw new UnexpectedResponseError(`getTripPlan gave the ${plan.viewerRole} shape to the owner`);
  }
  return plan;
}
