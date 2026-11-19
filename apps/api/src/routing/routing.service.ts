import { Injectable } from '@nestjs/common';
import { LIMITS, type DayRoute, type OrderSuggestion, type TravelMode } from '@heremita/shared';
import { ApiProblem } from '../core/http/api-problem.js';
import type { SessionUser } from '../core/http/api-request.js';
import { tripNotFound } from '../core/http/problems.js';
import { TripAccessService } from '../core/trip-access.service.js';
import type { TripRef } from '../core/trip-access.js';
import { OSM_ATTRIBUTION } from '../providers/core/contract.js';
import { routeQuality, sumLegs } from '../providers/core/estimates.js';
import { DayStopsReader } from './day-stops.reader.js';
import { LegRouter } from './leg-router.js';
import { optimiseOrder, straightLineMatrix } from './optimise.js';
import { plannedLegs } from './planned-legs.js';

/** Day routes (E40, E27) and stop-order suggestions (E41). */
@Injectable()
export class RoutingService {
  constructor(
    private readonly access: TripAccessService,
    private readonly days: DayStopsReader,
    private readonly legs: LegRouter,
  ) {}

  /**
   * The day's route for whoever may read the trip. Anonymous viewers never
   * cause a provider call: cached legs and estimates only.
   */
  async dayRoute(
    ref: TripRef,
    dayId: string,
    viewer: SessionUser | null,
    mode: TravelMode | undefined,
  ): Promise<DayRoute> {
    const { tripId } = await this.access.require(ref, viewer);
    const day = await this.days.read(tripId, dayId);
    const legs = await this.legs.route(plannedLegs(day.stops, day.dayMode, mode), {
      upstream: viewer !== null,
    });
    return {
      dayId,
      planVersion: day.planVersion,
      modeOverride: mode ?? null,
      quality: routeQuality(legs),
      ...sumLegs(legs),
      legs,
      attribution: OSM_ATTRIBUTION,
    };
  }

  /**
   * A shorter visiting order for the owner's day, with the route totals of the
   * current and the suggested order (routed where possible). Writes nothing:
   * the client applies it through the stop-order endpoint.
   */
  async orderSuggestion(
    owner: SessionUser,
    tripId: string,
    dayId: string,
    keepLast: boolean,
  ): Promise<OrderSuggestion> {
    const { role } = await this.access.require({ tripId }, owner);
    if (role !== 'owner') {
      throw tripNotFound();
    }
    const day = await this.days.read(tripId, dayId);
    if (day.stops.length < LIMITS.OPTIMISE_MIN_STOPS) {
      throw new ApiProblem(
        'too_few_stops',
        `Ordering needs at least ${LIMITS.OPTIMISE_MIN_STOPS} stops on the day.`,
      );
    }
    const order = optimiseOrder(straightLineMatrix(day.stops.map((stop) => stop.location)), {
      keepLast,
    });
    const suggested = order.map((index) => day.stops[index]!);
    const before = await this.legs.route(plannedLegs(day.stops, day.dayMode), { upstream: true });
    const after = await this.legs.route(plannedLegs(suggested, day.dayMode), { upstream: true });
    return {
      dayId,
      planVersion: day.planVersion,
      stopIds: suggested.map((stop) => stop.id),
      before: sumLegs(before),
      after: sumLegs(after),
      estimated: [...before, ...after].some((leg) => leg.estimated),
    };
  }
}
