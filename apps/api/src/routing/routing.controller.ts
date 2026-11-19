import { Controller, Res } from '@nestjs/common';
import {
  endpoints,
  type DayRoute,
  type EndpointInput,
  type OrderSuggestion,
} from '@heremita/shared';
import type { Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { RoutingService } from './routing.service.js';

/** Routes change whenever a leg's cache entry does: the browser revalidates every time. */
const DAY_ROUTE_CACHE_CONTROL = 'private, no-cache';

/** Day routes by trip id (E40) and by share token (E27); stop-order suggestions (E41). */
@Controller()
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Endpoint(endpoints.getDayRoute)
  async getDayRoute(
    @CurrentUser() user: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.getDayRoute>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DayRoute> {
    const { tripId, dayId } = input.params;
    const route = await this.routing.dayRoute({ tripId }, dayId, user, input.query.mode);
    response.setHeader('Cache-Control', DAY_ROUTE_CACHE_CONTROL);
    return route;
  }

  @Endpoint(endpoints.getSharedDayRoute)
  async getSharedDayRoute(
    @CurrentUser() user: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.getSharedDayRoute>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DayRoute> {
    const { shareToken, dayId } = input.params;
    const route = await this.routing.dayRoute({ shareToken }, dayId, user, input.query.mode);
    response.setHeader('Cache-Control', DAY_ROUTE_CACHE_CONTROL);
    return route;
  }

  @Endpoint(endpoints.getOrderSuggestion)
  getOrderSuggestion(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.getOrderSuggestion>,
  ): Promise<OrderSuggestion> {
    const { tripId, dayId } = input.params;
    return this.routing.orderSuggestion(user, tripId, dayId, input.query.keepLast);
  }
}
