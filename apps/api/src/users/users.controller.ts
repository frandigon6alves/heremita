import { Controller } from '@nestjs/common';
import {
  endpoints,
  type EndpointInput,
  type Page,
  type PublicTripCard,
  type Review,
  type UserProfile,
} from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { UsersService } from './users.service.js';

/** Public profiles (E15–E17); E4 `POST /users` (sign-up) lives with login. */
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Endpoint(endpoints.getUserProfile)
  getUserProfile(
    @CurrentUser() viewer: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.getUserProfile>,
  ): Promise<UserProfile> {
    return this.users.profile(input.params.userId, viewer?.id ?? null);
  }

  @Endpoint(endpoints.listUserTrips)
  listUserTrips(
    @CurrentUser() viewer: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.listUserTrips>,
  ): Promise<Page<PublicTripCard>> {
    return this.users.trips(input.params.userId, viewer?.id ?? null, input.query);
  }

  @Endpoint(endpoints.listUserReviews)
  listUserReviews(
    @CurrentUser() viewer: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.listUserReviews>,
  ): Promise<Page<Review>> {
    return this.users.reviews(input.params.userId, viewer?.id ?? null, input.query);
  }
}
