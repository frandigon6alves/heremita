import { Injectable } from '@nestjs/common';
import {
  type EndpointInput,
  type endpoints,
  type Page,
  type PublicTripCard,
  type Review,
  type UserProfile,
} from '@heremita/shared';
import { userNotBlockedBy } from '../core/block-filter.js';
import { CURSOR_TUPLES, decodeCursor, toPage } from '../core/cursor.js';
import { userNotFound } from '../core/http/problems.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PublicTripsReader } from '../discovery/public-trips.reader.js';
import { USER_CARD_SELECT } from '../core/user-card.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REVIEW_SELECT, toReview, toYearMonth } from '../reviews/review.mapper.js';

type PageQuery = EndpointInput<typeof endpoints.listUserTrips>['query'];

/** Trips anyone may see on a profile: public and not hidden by a moderator (V8). */
function listedTripsOf(userId: string, viewerId: string | null): Prisma.TripWhereInput {
  return {
    ownerId: userId,
    visibility: 'public',
    moderationHiddenAt: null,
    owner: userNotBlockedBy(viewerId),
  };
}

/** Published reviews; the author also sees their own hidden ones (V8). */
function listedReviewsOf(userId: string, viewerId: string | null): Prisma.ReviewWhereInput {
  return {
    authorId: userId,
    ...(viewerId !== userId && { status: 'published' }),
    author: userNotBlockedBy(viewerId),
  };
}

/**
 * Public profiles (E15–E17). A viewer who blocked the user sees the profile
 * but none of their trips or reviews, and counts that match the empty lists.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicTrips: PublicTripsReader,
  ) {}

  /** E15. */
  async profile(userId: string, viewerId: string | null): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...USER_CARD_SELECT, createdAt: true },
    });
    if (!user) {
      throw userNotFound();
    }
    const [publicTripCount, reviewCount] = await Promise.all([
      this.prisma.trip.count({ where: listedTripsOf(userId, viewerId) }),
      this.prisma.review.count({ where: listedReviewsOf(userId, viewerId) }),
    ]);
    return {
      id: user.id,
      displayName: user.displayName,
      isDemo: user.isDemo,
      joinedMonth: toYearMonth(user.createdAt),
      publicTripCount,
      reviewCount,
    };
  }

  /** E16: the discovery list narrowed to one author, so both lists filter and sort alike. */
  async trips(
    userId: string,
    viewerId: string | null,
    query: PageQuery,
  ): Promise<Page<PublicTripCard>> {
    await this.assertExists(userId);
    return this.publicTrips.page({ viewerId, ownerId: userId, ...query });
  }

  /** E17, newest first: `(created_at DESC, id DESC)`. */
  async reviews(userId: string, viewerId: string | null, query: PageQuery): Promise<Page<Review>> {
    const after = decodeCursor(CURSOR_TUPLES.recentReviews, query.cursor);
    await this.assertExists(userId);
    const rows = await this.prisma.review.findMany({
      where: {
        ...listedReviewsOf(userId, viewerId),
        ...(after && {
          OR: [{ createdAt: { lt: after[0] } }, { createdAt: after[0], id: { lt: after[1] } }],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: REVIEW_SELECT,
    });
    const page = toPage(rows, query.limit, CURSOR_TUPLES.recentReviews, (row) => [
      row.createdAt,
      row.id,
    ]);
    return {
      items: page.items.map((row) => toReview(row, viewerId)),
      nextCursor: page.nextCursor,
    };
  }

  private async assertExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw userNotFound();
    }
  }
}
