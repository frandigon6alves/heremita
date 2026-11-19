import type { LngLat, TravelMode } from '@heremita/shared';
import type {
  ProviderError,
  RouteRequest,
  RouteResult,
  RoutingProvider,
} from '../../src/providers/core/contract.js';
import { FakeRouter } from '../../src/providers/fake/fake-router.js';
import type { TestApp } from '../support/app.js';
import type { TestUser } from '../support/factories.js';
import { callOk } from '../support/http.js';

/** The fake router, counting the calls that reach it; while `failure` is set, every call rejects with it. */
export class CountingRouter implements RoutingProvider {
  readonly id = 'fake';
  readonly capabilities: RoutingProvider['capabilities'];
  readonly calls: RouteRequest[] = [];
  failure: ProviderError | undefined;

  constructor() {
    this.capabilities = new FakeRouter().capabilities;
  }

  route(request: RouteRequest): Promise<RouteResult> {
    this.calls.push(request);
    return this.failure ? Promise.reject(this.failure) : new FakeRouter().route(request);
  }
}

/** Lisbon, about 300–900 m apart: walkable, routed by the fake router. */
export const LISBON: readonly LngLat[] = [
  { lng: -9.1366, lat: 38.7075 },
  { lng: -9.1393, lat: 38.7101 },
  { lng: -9.1428, lat: 38.7139 },
  { lng: -9.1335, lat: 38.7133 },
  { lng: -9.1469, lat: 38.7067 },
];
/** North of 85°: the fake router snaps it too far, so its legs are estimates. */
export const OFF_NETWORK: LngLat = { lng: -9.14, lat: 86 };

export interface StopSpec {
  at: LngLat;
  modeToNext?: TravelMode;
}

export interface DayWithStops {
  tripId: string;
  dayId: string;
  stopIds: string[];
}

/** Trips through the API; their places and stops straight into the database at chosen coordinates. */
export class RouteRows {
  private osmId = 0;

  constructor(private readonly t: TestApp) {}

  async trip(owner: TestUser, stops: readonly StopSpec[], days = 1): Promise<DayWithStops> {
    const trip = await callOk(owner.agent, 'createTrip', {
      body: { title: 'Lisboa', dayCount: days },
    });
    const day = await this.t.prisma.day.findFirstOrThrow({
      where: { tripId: trip.id, position: 0 },
      select: { id: true },
    });
    return { tripId: trip.id, dayId: day.id, stopIds: await this.stops(trip.id, day.id, stops) };
  }

  async stops(tripId: string, dayId: string, stops: readonly StopSpec[]): Promise<string[]> {
    const ids: string[] = [];
    for (const [position, stop] of stops.entries()) {
      this.osmId += 1;
      const place = await this.t.prisma.place.create({
        data: {
          source: 'osm',
          osmType: 'N',
          osmId: this.osmId,
          name: `Place ${this.osmId}`,
          category: 'sight',
          lng: stop.at.lng,
          lat: stop.at.lat,
        },
      });
      const tripPlace = await this.t.prisma.tripPlace.create({
        data: { tripId, placeId: place.id },
      });
      const created = await this.t.prisma.stop.create({
        data: {
          tripId,
          dayId,
          tripPlaceId: tripPlace.id,
          position,
          modeToNext: stop.modeToNext ?? null,
        },
      });
      ids.push(created.id);
    }
    return ids;
  }

  legCacheKeys(): Promise<string[]> {
    return this.t.prisma.providerCache
      .findMany({
        where: { key: { startsWith: 'leg:' } },
        select: { key: true },
        orderBy: { key: 'asc' },
      })
      .then((rows) => rows.map((row) => row.key));
  }
}

export function at(...points: readonly LngLat[]): StopSpec[] {
  return points.map((point) => ({ at: point }));
}
