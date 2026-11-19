import { Inject, Injectable } from '@nestjs/common';
import {
  LIMITS,
  type AddStopResponse,
  type EndpointInput,
  type endpoints,
  type PlanChange,
} from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { ApiProblem } from '../core/http/api-problem.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { insertAt, writeDayOrder } from './day-order.js';
import { lockPlan } from './plan-lock.js';
import {
  dayFull,
  dayOfTrip,
  insertStop,
  stopIdsOf,
  stopNotFound,
  tripPlaceNotFound,
} from './plan-queries.js';

type AddStopBody = EndpointInput<typeof endpoints.addStop>['body'];
type StopOrderBody = EndpointInput<typeof endpoints.putStopOrder>['body'];
type StopPlacementBody = EndpointInput<typeof endpoints.putStopPlacement>['body'];
type UpdateStopBody = EndpointInput<typeof endpoints.updateStop>['body'];

/** The day a stop of the trip is on, or 404 `not_found`. */
async function dayOfStop(
  tx: Prisma.TransactionClient,
  tripId: string,
  stopId: string,
): Promise<string> {
  const stop = await tx.stop.findFirst({ where: { id: stopId, tripId }, select: { dayId: true } });
  if (!stop) {
    throw stopNotFound();
  }
  return stop.dayId;
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  const members = new Set(a);
  return a.length === b.length && b.every((id) => members.has(id));
}

/** Stops: trip places scheduled on a day, in visit order (E35–E39). Every write starts with the plan lock. */
@Injectable()
export class StopsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** E35: schedules a trip place on the day at the clamped `index` (appended without one). */
  async add(
    userId: string,
    tripId: string,
    dayId: string,
    body: AddStopBody,
  ): Promise<AddStopResponse> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      await dayOfTrip(tx, tripId, dayId);
      const tripPlace = await tx.tripPlace.count({ where: { id: body.tripPlaceId, tripId } });
      if (tripPlace === 0) {
        throw tripPlaceNotFound();
      }
      const stopId = await insertStop(
        tx,
        { tripId, dayId, tripPlaceId: body.tripPlaceId, index: body.index },
        now,
      );
      return {
        stop: { id: stopId, tripPlaceId: body.tripPlaceId, modeToNext: null },
        planVersion: plan.planVersion,
      };
    });
  }

  /**
   * E36: the day's full new order. A list that is not exactly the day's
   * current stops (a stale tab) → 409 `plan_changed` with the version the
   * client must refetch; nothing is written.
   */
  async putOrder(
    userId: string,
    tripId: string,
    dayId: string,
    body: StopOrderBody,
  ): Promise<PlanChange> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      await dayOfTrip(tx, tripId, dayId);
      const current = await stopIdsOf(tx, dayId);
      if (!sameMembers(current, body.stopIds)) {
        throw new ApiProblem('plan_changed', 'The day changed meanwhile; reload the plan.', {
          currentPlanVersion: plan.planVersion - 1,
        });
      }
      await writeDayOrder(tx, dayId, body.stopIds);
      return { planVersion: plan.planVersion };
    });
  }

  /** E37: moves a stop to the clamped `index` of the same or another day; a full other day → 409 `day_full`. */
  async putPlacement(
    userId: string,
    tripId: string,
    stopId: string,
    body: StopPlacementBody,
  ): Promise<PlanChange> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      const fromDayId = await dayOfStop(tx, tripId, stopId);
      await dayOfTrip(tx, tripId, body.dayId);
      const source = (await stopIdsOf(tx, fromDayId)).filter((id) => id !== stopId);
      if (fromDayId === body.dayId) {
        await writeDayOrder(tx, fromDayId, insertAt(source, stopId, body.index));
        return { planVersion: plan.planVersion };
      }
      const target = await stopIdsOf(tx, body.dayId);
      if (target.length >= LIMITS.STOPS_PER_DAY) {
        throw dayFull();
      }
      await writeDayOrder(tx, fromDayId, source);
      await writeDayOrder(tx, body.dayId, insertAt(target, stopId, body.index));
      return { planVersion: plan.planVersion };
    });
  }

  /** E38: the travel mode of the leg leaving this stop (`null` = the day's mode). */
  async update(
    userId: string,
    tripId: string,
    stopId: string,
    body: UpdateStopBody,
  ): Promise<PlanChange> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      const { count } = await tx.stop.updateMany({
        where: { id: stopId, tripId },
        data: { modeToNext: body.modeToNext },
      });
      if (count === 0) {
        throw stopNotFound();
      }
      return { planVersion: plan.planVersion };
    });
  }

  /** E39: the stop leaves its day (which closes up); its trip place stays, as an idea when on no other day. */
  async delete(userId: string, tripId: string, stopId: string): Promise<PlanChange> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      const dayId = await dayOfStop(tx, tripId, stopId);
      await tx.stop.delete({ where: { id: stopId } });
      await writeDayOrder(tx, dayId, await stopIdsOf(tx, dayId));
      return { planVersion: plan.planVersion };
    });
  }
}
