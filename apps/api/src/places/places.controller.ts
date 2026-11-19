import { Controller, Header } from '@nestjs/common';
import {
  endpoints,
  type EndpointInput,
  type PlaceDetail,
  type PlaceResults,
} from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { PlacesService } from './places.service.js';

/**
 * Place search, reverse geocoding and the place page (E42–E44). `search` and
 * `reverse` are declared before `:placeId` so Express never reads them as ids.
 */
@Controller()
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Endpoint(endpoints.searchPlaces)
  @Header('Cache-Control', 'private, max-age=300')
  searchPlaces(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.searchPlaces>,
  ): Promise<PlaceResults> {
    return this.places.search(input.query, user.id);
  }

  @Endpoint(endpoints.reversePlaces)
  reversePlaces(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.reversePlaces>,
  ): Promise<PlaceResults> {
    return this.places.reverse(input.query, user.id);
  }

  @Endpoint(endpoints.getPlace)
  getPlace(
    @CurrentUser() user: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.getPlace>,
  ): Promise<PlaceDetail> {
    return this.places.detail(input.params.placeId, user?.id ?? null);
  }
}
