import { Inject, Injectable } from '@nestjs/common';
import {
  LIMITS,
  type CreateDayResponse,
  type EndpointInput,
  type endpoints,
  type PlanChange,
} from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { ApiProblem } from '../core/http/api-problem.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { insertAt, writeTripDayOrder } from './day-order.js';
import { lockPlan } from './plan-lock.js';
import { dayIdsOf, dayNotFound, dayOfTrip } from './plan-queries.js';
import { toDayOwner } from './plan.mapper.js';

type CreateDayBody = EndpointInput<typeof endpoints.createDay>['body'];
type UpdateDayBody = EndpointInput<typeof endpoints.updateDay>['body'];

/** Days of a trip (E32–E34). Every write starts with the plan lock. */
@Injectable()
export class DaysService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** E32: an empty day at the clamped `index` (appended without one); later days move down. */
  async create(userId: string, tripId: string, body: CreateDayBody): Promise<CreateDayResponse> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      const dayIds = await dayIdsOf(tx, tripId);
      if (dayIds.length >= LIMITS.DAYS_PER_TRIP) {
        throw new ApiProblem('limit_reached', `A trip holds at most ${LIMITS.DAYS_PER_TRIP} days.`);
      }
      const day = await tx.day.create({
        data: { tripId, position: dayIds.length, createdAt: now },
        select: { id: true, modeOverride: true },
      });
      const order = insertAt(dayIds, day.id, body.index);
      if (order.at(-1) !== day.id) {
        await writeTripDayOrder(tx, tripId, order);
      }
      return {
        day: toDayOwner({ ...day, position: order.indexOf(day.id) }, plan, []),
        planVersion: plan.planVersion,
      };
    });
  }

  /** E33: the day's own travel mode (`null` = the trip's default mode). */
  async update(
    userId: string,
    tripId: string,
    dayId: string,
    body: UpdateDayBody,
  ): Promise<PlanChange> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      const { count } = await tx.day.updateMany({
        where: { id: dayId, tripId },
        data: { modeOverride: body.modeOverride },
      });
      if (count === 0) {
        throw dayNotFound();
      }
      return { planVersion: plan.planVersion };
    });
  }

  /** E34: its stops go (their places stay in the trip, as ideas when on no other day); later days move up. */
  async delete(userId: string, tripId: string, dayId: string): Promise<PlanChange> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      await dayOfTrip(tx, tripId, dayId);
      await tx.day.delete({ where: { id: dayId } });
      await writeTripDayOrder(tx, tripId, await dayIdsOf(tx, tripId));
      return { planVersion: plan.planVersion };
    });
  }
}
