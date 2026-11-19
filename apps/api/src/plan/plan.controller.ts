import { Controller } from '@nestjs/common';
import {
  endpoints,
  type EndpointInput,
  type TripPlan,
  type TripPlanViewer,
} from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { PlanReader } from './plan.reader.js';

/** The planner read, by trip id or by share link (E24, E26). */
@Controller()
export class PlanController {
  constructor(private readonly plans: PlanReader) {}

  @Endpoint(endpoints.getTripPlan)
  getTripPlan(
    @CurrentUser() user: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.getTripPlan>,
  ): Promise<TripPlan> {
    return this.plans.read({ tripId: input.params.tripId }, user);
  }

  @Endpoint(endpoints.getSharedPlan)
  async getSharedPlan(
    @CurrentUser() user: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.getSharedPlan>,
  ): Promise<TripPlanViewer> {
    const plan = await this.plans.read({ shareToken: input.params.shareToken }, user);
    if (plan.viewerRole !== 'viewer') {
      throw new Error('A share link always opens the viewer shape');
    }
    return plan;
  }
}
