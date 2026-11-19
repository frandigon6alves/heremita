import { Inject, Injectable } from '@nestjs/common';
import type { EndpointInput, endpoints, Page, Review } from '@heremita/shared';
import { userNotBlockedBy } from '../core/block-filter.js';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { CURSOR_TUPLES, decodeCursor, toPage } from '../core/cursor.js';
import { invalidFields, placeNotFound } from '../core/http/problems.js';
import type { SessionUser } from '../core/http/api-request.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REVIEW_SELECT, toReview, toVisitedMonth } from './review.mapper.js';

type ListQuery = EndpointInput<typeof endpoints.listPlaceReviews>['query'];
type PutBody = EndpointInput<typeof endpoints.putMyReview>['body'];

export interface PutReviewResult {
  review: Review;
  created: boolean;
}

/**
 * Keyset condition after the last row of the previous page, for the sort the
 * cursor was issued for. `null` cursor → first page.
 */
function afterCursor(query: ListQuery): Prisma.ReviewWhereInput {
  if (query.sort === 'lowest') {
    const after = decodeCursor(CURSOR_TUPLES.lowestReviews, query.cursor);
    if (!after) {
      return {};
    }
    const [rating, createdAt, id] = after;
    return {
      OR: [
        { rating: { gt: rating } },
        { rating, createdAt: { lt: createdAt } },
        { rating, createdAt, id: { lt: id } },
      ],
    };
  }
  const after = decodeCursor(CURSOR_TUPLES.recentReviews, query.cursor);
  if (!after) {
    return {};
  }
  const [createdAt, id] = after;
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

const ORDER_BY: Record<ListQuery['sort'], Prisma.ReviewOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }, { id: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
};

/** Reviews of a place (E45–E47): one per user and place, only on OSM places (V11, V49). */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * E45: published reviews plus the viewer's own hidden one (V8), leaving out
   * authors the viewer blocked (V9).
   */
  async list(placeId: string, viewerId: string | null, query: ListQuery): Promise<Page<Review>> {
    const after = afterCursor(query);
    await this.assertReviewable(placeId);
    const rows = await this.prisma.review.findMany({
      where: {
        AND: [
          { placeId, author: userNotBlockedBy(viewerId) },
          viewerId === null
            ? { status: 'published' }
            : { OR: [{ status: 'published' }, { authorId: viewerId }] },
          after,
        ],
      },
      orderBy: ORDER_BY[query.sort],
      take: query.limit + 1,
      select: REVIEW_SELECT,
    });
    const page =
      query.sort === 'lowest'
        ? toPage(rows, query.limit, CURSOR_TUPLES.lowestReviews, (row) => [
            row.rating,
            row.createdAt,
            row.id,
          ])
        : toPage(rows, query.limit, CURSOR_TUPLES.recentReviews, (row) => [row.createdAt, row.id]);
    return {
      items: page.items.map((row) => toReview(row, viewerId)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * E46: writes the caller's review in their current locale. A replaced
   * review keeps its moderation status, so editing never undoes a hide.
   */
  async putMine(user: SessionUser, placeId: string, body: PutBody): Promise<PutReviewResult> {
    const now = this.clock.now();
    if (body.visitedMonth > toVisitedMonth(now)) {
      throw invalidFields([
        { pointer: '/body/visitedMonth', detail: 'The visit month is in the future.' },
      ]);
    }
    await this.assertReviewable(placeId);
    const [written] = await this.prisma.$queryRaw<{ id: string; created: boolean }[]>`
      INSERT INTO reviews (place_id, author_id, rating, body, visited_on, language, created_at, updated_at)
      VALUES (${placeId}::uuid, ${user.id}::uuid, ${body.rating}, ${body.body},
              ${`${body.visitedMonth}-01`}::date, ${user.locale}::"Locale", ${now}, ${now})
      ON CONFLICT (place_id, author_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        body = EXCLUDED.body,
        visited_on = EXCLUDED.visited_on,
        language = EXCLUDED.language,
        updated_at = EXCLUDED.updated_at
      RETURNING id::text AS id, (xmax = 0) AS created`;
    if (!written) {
      throw new Error('INSERT … RETURNING gave no row');
    }
    const row = await this.prisma.review.findUniqueOrThrow({
      where: { id: written.id },
      select: REVIEW_SELECT,
    });
    return { review: toReview(row, user.id), created: written.created };
  }

  /** E47. Idempotent: no review to delete is not an error (CD2, V27). */
  async deleteMine(userId: string, placeId: string): Promise<void> {
    await this.assertReviewable(placeId);
    await this.prisma.review.deleteMany({ where: { placeId, authorId: userId } });
  }

  /** Only OSM places take reviews; a custom pin looks missing (V11). */
  private async assertReviewable(placeId: string): Promise<void> {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, source: 'osm' },
      select: { id: true },
    });
    if (!place) {
      throw placeNotFound();
    }
  }
}
