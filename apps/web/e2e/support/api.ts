import {
  DEFAULT_LOCALE,
  endpoints,
  type EndpointDef,
  type EndpointOutput,
  type Locale,
  type Me,
  type TripPlanOwner,
} from '@heremita/shared';
import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { endpointPath, type RequestArgs, type UntypedOptions } from '../../src/lib/api/request';
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from './environment';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** A signed-up account, the browser state that holds its session and an API client acting as it. */
export interface Account {
  me: Me;
  email: string;
  password: string;
  storageState: StorageState;
  api: ApiClient;
}

/**
 * Typed calls straight to the API under test (port 3111), for arranging data a
 * journey does not exercise through the UI. Same-origin like the browser: the
 * `Origin` header passes the CSRF check.
 */
export class ApiClient {
  constructor(readonly request: APIRequestContext) {}

  async call<E extends EndpointDef>(
    def: E,
    ...[options]: RequestArgs<E>
  ): Promise<EndpointOutput<E>> {
    const { params, query, body } = (options ?? {}) as UntypedOptions;
    const response = await this.request.fetch(endpointPath(def, { params, query }), {
      method: def.method,
      ...(body === undefined ? {} : { data: body }),
    });
    const expected = [def.status, def.alternateStatus].filter((status) => status !== undefined);
    expect(expected, `${def.method} ${def.path}: ${await response.text()}`).toContain(
      response.status(),
    );
    return (def.status === 204 ? undefined : await response.json()) as EndpointOutput<E>;
  }
}

/** A client that sends requests from `clientAddress` (sign-up allows 5 per hour per IP). */
export async function newApiContext(
  request: { newContext: (options: object) => Promise<APIRequestContext> },
  clientAddress: string,
): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: E2E_API_ORIGIN,
    extraHTTPHeaders: { Origin: E2E_WEB_ORIGIN, 'X-Forwarded-For': clientAddress },
  });
}

/** Signs up through the API; the returned client carries the new session cookie. */
export async function signUp(
  context: APIRequestContext,
  {
    displayName,
    email,
    password,
    locale = DEFAULT_LOCALE,
  }: { displayName: string; email: string; password: string; locale?: Locale },
): Promise<Account> {
  const api = new ApiClient(context);
  const me = await api.call(endpoints.signUp, {
    body: { displayName, email, password, locale },
  });
  return { me, email, password, storageState: await context.storageState(), api };
}

/** Gazetteer keys of the fake geocoder (real OSM objects) used by the journeys. */
export const PLACES = {
  torreDeBelem: 'osm:W:24341353',
  mosteiroDosJeronimos: 'osm:R:3258300',
  padraoDosDescobrimentos: 'osm:W:152327819',
  pasteisDeBelem: 'osm:N:398922337',
  lxFactory: 'osm:W:221960606',
  pracaDoComercio: 'osm:W:677181958',
  casteloDeSaoJorge: 'osm:W:1382432568',
  sainteChapelle: 'osm:R:3344870',
} as const;

/** Centre of Lisbon's Praça do Comércio: trips start their map there. */
export const LISBON = { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.1365, lat: 38.7075 } };

export interface ArrangedTrip {
  id: string;
  plan: TripPlanOwner;
}

/**
 * Creates a trip with `days.length` days and puts the given places on them, in
 * order (OSM keys from `PLACES`). Ideas are trip places without a day.
 */
export async function arrangeTrip(
  api: ApiClient,
  {
    title,
    days,
    ideas = [],
  }: { title: string; days: ReadonlyArray<readonly string[]>; ideas?: readonly string[] },
): Promise<ArrangedTrip> {
  const trip = await api.call(endpoints.createTrip, {
    body: { title, destination: LISBON, dayCount: Math.max(days.length, 1) },
  });
  const initial = await readPlan(api, trip.id);
  for (const [index, keys] of days.entries()) {
    const dayId = initial.days[index]?.id;
    for (const key of keys) {
      await api.call(endpoints.addTripPlace, {
        params: { tripId: trip.id },
        body: { place: { type: 'osm', key }, schedule: dayId ? { dayId } : null },
      });
    }
  }
  for (const key of ideas) {
    await api.call(endpoints.addTripPlace, {
      params: { tripId: trip.id },
      body: { place: { type: 'osm', key } },
    });
  }
  return { id: trip.id, plan: await readPlan(api, trip.id) };
}

export async function readPlan(api: ApiClient, tripId: string): Promise<TripPlanOwner> {
  const plan = await api.call(endpoints.getTripPlan, { params: { tripId } });
  if (plan.viewerRole !== 'owner') {
    throw new Error(`Trip ${tripId} is not owned by the caller`);
  }
  return plan;
}

/** Place names of a day, in visit order (`dayIndex` 0 = day 1). */
export function dayPlaceNames(plan: TripPlanOwner, dayIndex: number): string[] {
  const day = plan.days[dayIndex];
  return (day?.stops ?? []).map(
    (stop) => plan.places.find((entry) => entry.id === stop.tripPlaceId)?.place.name ?? '?',
  );
}
