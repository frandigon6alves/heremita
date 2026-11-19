import { Controller } from '@nestjs/common';
import { endpoints, type EndpointInput, type Page, type PublicTripCard } from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { PublicTripsReader } from './public-trips.reader.js';

/** Browsing other travellers' public trips (E48). */
@Controller()
export class DiscoveryController {
  constructor(private readonly publicTrips: PublicTripsReader) {}

  @Endpoint(endpoints.listPublicTrips)
  listPublicTrips(
    @CurrentUser() user: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.listPublicTrips>,
  ): Promise<Page<PublicTripCard>> {
    return this.publicTrips.page({ viewerId: user?.id ?? null, ...input.query });
  }
}
