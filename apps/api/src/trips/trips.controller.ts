import { Controller, Res } from '@nestjs/common';
import {
  API_PREFIX,
  endpoints,
  type EndpointInput,
  type MyTripCard,
  type Page,
  type ShareTokenResponse,
  type Trip,
  type TripOwner,
} from '@heremita/shared';
import type { Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { TripsService } from './trips.service.js';

function created(response: Response, trip: TripOwner): TripOwner {
  response.location(`${API_PREFIX}/trips/${trip.id}`);
  return trip;
}

/** The caller's trips, a trip itself, its share link and its copies (E18–E23, E25, E28). */
@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Endpoint(endpoints.listMyTrips)
  listMyTrips(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.listMyTrips>,
  ): Promise<Page<MyTripCard>> {
    return this.trips.listMine(user.id, input.query);
  }

  @Endpoint(endpoints.createTrip)
  async createTrip(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.createTrip>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TripOwner> {
    return created(response, await this.trips.create(user.id, input.body));
  }

  @Endpoint(endpoints.getTrip)
  getTrip(
    @CurrentUser() user: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.getTrip>,
  ): Promise<Trip> {
    return this.trips.get(input.params.tripId, user);
  }

  @Endpoint(endpoints.updateTrip)
  updateTrip(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.updateTrip>,
  ): Promise<TripOwner> {
    return this.trips.update(user.id, input.params.tripId, input.body);
  }

  @Endpoint(endpoints.deleteTrip)
  deleteTrip(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.deleteTrip>,
  ): Promise<void> {
    return this.trips.delete(user.id, input.params.tripId);
  }

  @Endpoint(endpoints.rotateShareToken)
  rotateShareToken(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.rotateShareToken>,
  ): Promise<ShareTokenResponse> {
    return this.trips.rotateShareToken(user.id, input.params.tripId);
  }

  @Endpoint(endpoints.copyTrip)
  async copyTrip(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.copyTrip>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TripOwner> {
    const copy = await this.trips.copy(user, { tripId: input.params.tripId }, input.body);
    return created(response, copy);
  }

  @Endpoint(endpoints.copySharedTrip)
  async copySharedTrip(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.copySharedTrip>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TripOwner> {
    const copy = await this.trips.copy(user, { shareToken: input.params.shareToken }, input.body);
    return created(response, copy);
  }
}
