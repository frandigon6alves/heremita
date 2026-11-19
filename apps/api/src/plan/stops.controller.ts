import { Controller, Res } from '@nestjs/common';
import {
  API_PREFIX,
  endpoints,
  type AddStopResponse,
  type EndpointInput,
  type PlanChange,
} from '@heremita/shared';
import type { Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { StopsService } from './stops.service.js';

/** Stops of a trip's days (E35–E39). */
@Controller()
export class StopsController {
  constructor(private readonly stops: StopsService) {}

  @Endpoint(endpoints.addStop)
  async addStop(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.addStop>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AddStopResponse> {
    const { tripId, dayId } = input.params;
    const added = await this.stops.add(user.id, tripId, dayId, input.body);
    response.location(`${API_PREFIX}/trips/${tripId}/stops/${added.stop.id}`);
    return added;
  }

  @Endpoint(endpoints.putStopOrder)
  putStopOrder(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.putStopOrder>,
  ): Promise<PlanChange> {
    const { tripId, dayId } = input.params;
    return this.stops.putOrder(user.id, tripId, dayId, input.body);
  }

  @Endpoint(endpoints.putStopPlacement)
  putStopPlacement(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.putStopPlacement>,
  ): Promise<PlanChange> {
    const { tripId, stopId } = input.params;
    return this.stops.putPlacement(user.id, tripId, stopId, input.body);
  }

  @Endpoint(endpoints.updateStop)
  updateStop(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.updateStop>,
  ): Promise<PlanChange> {
    const { tripId, stopId } = input.params;
    return this.stops.update(user.id, tripId, stopId, input.body);
  }

  @Endpoint(endpoints.deleteStop)
  deleteStop(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.deleteStop>,
  ): Promise<PlanChange> {
    return this.stops.delete(user.id, input.params.tripId, input.params.stopId);
  }
}
