import { Controller, Res } from '@nestjs/common';
import {
  API_PREFIX,
  endpoints,
  type CreateDayResponse,
  type EndpointInput,
  type PlanChange,
} from '@heremita/shared';
import type { Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { DaysService } from './days.service.js';

/** Days of a trip (E32–E34). */
@Controller()
export class DaysController {
  constructor(private readonly days: DaysService) {}

  @Endpoint(endpoints.createDay)
  async createDay(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.createDay>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateDayResponse> {
    const { tripId } = input.params;
    const created = await this.days.create(user.id, tripId, input.body);
    response.location(`${API_PREFIX}/trips/${tripId}/days/${created.day.id}`);
    return created;
  }

  @Endpoint(endpoints.updateDay)
  updateDay(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.updateDay>,
  ): Promise<PlanChange> {
    return this.days.update(user.id, input.params.tripId, input.params.dayId, input.body);
  }

  @Endpoint(endpoints.deleteDay)
  deleteDay(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.deleteDay>,
  ): Promise<PlanChange> {
    return this.days.delete(user.id, input.params.tripId, input.params.dayId);
  }
}
