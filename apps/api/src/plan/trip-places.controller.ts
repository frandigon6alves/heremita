import { Controller, Res } from '@nestjs/common';
import {
  API_PREFIX,
  endpoints,
  type AddTripPlaceResponse,
  type EndpointInput,
  type PlanChange,
  type UpdateTripPlaceResponse,
} from '@heremita/shared';
import type { Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { TripPlacesService } from './trip-places.service.js';

/** Places saved to a trip (E29–E31). */
@Controller()
export class TripPlacesController {
  constructor(private readonly tripPlaces: TripPlacesService) {}

  // SHORTCUT(owner): no Idempotency-Key on POST /trips/{tripId}/places — ceiling: a manual Retry after a lost response can duplicate a custom pin; upgrade: first user report of duplicates
  @Endpoint(endpoints.addTripPlace)
  async addTripPlace(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.addTripPlace>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AddTripPlaceResponse> {
    const { tripId } = input.params;
    const added = await this.tripPlaces.add(user, tripId, input.body);
    response.location(`${API_PREFIX}/trips/${tripId}/places/${added.tripPlace.id}`);
    return added;
  }

  // SHORTCUT(owner): note autosave has no concurrency control — ceiling: two tabs editing one note, last write wins; upgrade: first report of a lost note
  @Endpoint(endpoints.updateTripPlace)
  updateTripPlace(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.updateTripPlace>,
  ): Promise<UpdateTripPlaceResponse> {
    const { tripId, tripPlaceId } = input.params;
    return this.tripPlaces.update(user, tripId, tripPlaceId, input.body);
  }

  @Endpoint(endpoints.deleteTripPlace)
  deleteTripPlace(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.deleteTripPlace>,
  ): Promise<PlanChange> {
    return this.tripPlaces.delete(user.id, input.params.tripId, input.params.tripPlaceId);
  }
}
