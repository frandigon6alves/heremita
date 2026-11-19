import { z } from 'zod';
import {
  idSchema,
  localeSchema,
  pageQuerySchema,
  placeCategorySchema,
  timestampSchema,
  userCardSchema,
  yearMonthSchema,
} from './common.js';
import { LIMITS } from './limits.js';
import { REVIEW_SORTS } from './options.js';
import { textSchema } from './text.js';

export const reviewSortSchema = z.enum(REVIEW_SORTS);

export const reviewStatusSchema = z.enum(['published', 'hidden']);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const ratingSchema = z.int().min(1).max(5);

/** `visitedMonth` must not be in the future: the API checks it against its clock (422 `/body/visitedMonth`). */
export const putReviewBodySchema = z
  .strictObject({
    rating: ratingSchema,
    body: textSchema(LIMITS.REVIEW_BODY_MIN, LIMITS.REVIEW_BODY_MAX),
    visitedMonth: yearMonthSchema,
  })
  .meta({ id: 'PutReviewBody' });
export type PutReviewBody = z.input<typeof putReviewBodySchema>;

export const reviewSchema = z
  .object({
    id: idSchema,
    place: z.object({ id: idSchema, name: z.string(), category: placeCategorySchema }),
    rating: ratingSchema,
    body: z.string(),
    visitedMonth: yearMonthSchema,
    language: localeSchema,
    author: userCardSchema,
    status: reviewStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    isMine: z.boolean(),
  })
  .meta({ id: 'Review' });
export type Review = z.infer<typeof reviewSchema>;

export const placeReviewsQuerySchema = pageQuerySchema(LIMITS.PAGE_SIZES.reviews).extend({
  sort: reviewSortSchema.default('recent'),
});
export type PlaceReviewsQuery = z.input<typeof placeReviewsQuerySchema>;
