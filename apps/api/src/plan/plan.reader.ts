import { Inject, Injectable } from '@nestjs/common';
import type { TripPlan } from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { TripAccessService } from '../core/trip-access.service.js';
import type { TripRef } from '../core/trip-access.js';
import { RatingSummaryReader } from '../core/rating-summary.reader.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { cachedLegSchema } from '../providers/core/cache-keys.js';
import { ROUTING_PROVIDER, type RoutingProvider } from '../providers/core/contract.js';
import { ProviderCacheService } from '../providers/core/provider-cache.service.js';
import { toTripOwner, toTripPublic, TRIP_SELECT } from '../trips/trip.mapper.js';
import {
  toDayOwner,
  toTripPlaceOwner,
  toTripPlaceViewer,
  ratingOf,
  TRIP_PLACE_SELECT,
} from './plan.mapper.js';
import { tripNotFound } from './plan-lock.js';
import { plannedLegs, summariseDayRoute, type RouteStop } from './route-summaries.js';

/**
 * The planner read (E24, E26): trip, trip places with place and rating
 * summaries, days with ordered stops, and day route summaries from cached
 * legs. A fixed number of queries whatever the plan's size, and never a
 * provider call: a leg nobody routed yet is `null`.
 */
@Injectable()
export class PlanReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly ratings: RatingSummaryReader,
    private readonly cache: ProviderCacheService,
    @Inject(ROUTING_PROVIDER) private readonly router: RoutingProvider,
  ) {}

  /** E24 by trip id (owner shape for the owner), E26 by share token (always the viewer shape). */
  async read(ref: TripRef, viewer: SessionUser | null): Promise<TripPlan> {
    const access = await this.access.require(ref, viewer);
    const [trip, tripPlaces, days, stops] = await this.prisma.$transaction(
      [
        this.prisma.trip.findUnique({
          where: { id: access.tripId },
          select: { ...TRIP_SELECT, planVersion: true },
        }),
        this.prisma.tripPlace.findMany({
          where: { tripId: access.tripId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: TRIP_PLACE_SELECT,
        }),
        this.prisma.day.findMany({
          where: { tripId: access.tripId },
          orderBy: { position: 'asc' },
          select: { id: true, position: true, modeOverride: true },
        }),
        this.prisma.stop.findMany({
          where: { tripId: access.tripId },
          orderBy: [{ dayId: 'asc' }, { position: 'asc' }],
          select: { id: true, dayId: true, tripPlaceId: true, modeToNext: true },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    if (!trip) {
      throw tripNotFound();
    }

    const ratings = await this.ratings.read(
      tripPlaces.map((row) => row.place.id),
      viewer?.id ?? null,
    );
    const locations = new Map(
      tripPlaces.map((row) => [row.id, { lng: row.place.lng, lat: row.place.lat }]),
    );
    const stopsByDay = new Map<string, (RouteStop & { tripPlaceId: string })[]>();
    for (const stop of stops) {
      const location = locations.get(stop.tripPlaceId);
      // The snapshot holds every trip place its stops reference (composite FK).
      if (location) {
        const dayStops = stopsByDay.get(stop.dayId) ?? [];
        dayStops.push({ ...stop, location });
        stopsByDay.set(stop.dayId, dayStops);
      }
    }
    const planDays = days.map((day) => {
      const dayStops = stopsByDay.get(day.id) ?? [];
      const planDay = toDayOwner(
        day,
        trip,
        dayStops.map((stop) => ({
          id: stop.id,
          tripPlaceId: stop.tripPlaceId,
          modeToNext: stop.modeToNext,
        })),
      );
      return { planDay, legs: plannedLegs(this.router.id, planDay.mode, dayStops) };
    });
    const cached = await this.cache.getMany(
      planDays.flatMap((day) => day.legs.map((leg) => leg.key)),
      cachedLegSchema,
    );
    const routes = planDays.map((day) => summariseDayRoute(day.planDay.id, day.legs, cached));

    if (access.role === 'owner') {
      return {
        viewerRole: 'owner',
        trip: toTripOwner(trip),
        planVersion: trip.planVersion,
        places: tripPlaces.map((row) => toTripPlaceOwner(row, ratingOf(ratings, row.place.id))),
        days: planDays.map((day) => day.planDay),
        routes,
      };
    }
    return {
      viewerRole: 'viewer',
      trip: toTripPublic(trip),
      planVersion: trip.planVersion,
      places: tripPlaces.map((row) => toTripPlaceViewer(row, ratingOf(ratings, row.place.id))),
      days: planDays.map(({ planDay }) => ({
        id: planDay.id,
        number: planDay.number,
        mode: planDay.mode,
        modeOverride: planDay.modeOverride,
        stops: planDay.stops,
      })),
      routes,
    };
  }
}
