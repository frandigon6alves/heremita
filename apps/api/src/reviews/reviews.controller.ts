import { Controller, HttpStatus, Res } from '@nestjs/common';
import {
  API_PREFIX,
  endpoints,
  type EndpointInput,
  type Page,
  type Review,
} from '@heremita/shared';
import type { Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { ReviewsService } from './reviews.service.js';

/** Reviews of a place (E45) and the caller's own review of it (E46, E47). */
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Endpoint(endpoints.listPlaceReviews)
  listPlaceReviews(
    @CurrentUser() viewer: SessionUser | null,
    @Input() input: EndpointInput<typeof endpoints.listPlaceReviews>,
  ): Promise<Page<Review>> {
    return this.reviews.list(input.params.placeId, viewer?.id ?? null, input.query);
  }

  /** 201 + `Location` when the review is new, 200 when it replaced the caller's previous one. */
  @Endpoint(endpoints.putMyReview)
  async putMyReview(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.putMyReview>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Review> {
    const { placeId } = input.params;
    const { review, created } = await this.reviews.putMine(user, placeId, input.body);
    if (created) {
      response.location(`${API_PREFIX}/places/${placeId}/reviews/mine`);
    } else {
      response.status(HttpStatus.OK);
    }
    return review;
  }

  @Endpoint(endpoints.deleteMyReview)
  deleteMyReview(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.deleteMyReview>,
  ): Promise<void> {
    return this.reviews.deleteMine(user.id, input.params.placeId);
  }
}
