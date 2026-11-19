import { Injectable } from '@nestjs/common';
import { LIMITS, type RatingSummary } from '@heremita/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { andAuthorNotBlockedBy } from './block-filter.js';

/** Counts per star, index 0 = one star. */
export type StarCounts = readonly [number, number, number, number, number];

/**
 * The rating summary shown for a place: the count always; the average and the
 * distribution only from `RATING_AVERAGE_MIN_COUNT` reviews,
 * so a handful of reviews never reads as a verdict.
 */
export function summariseRatings(counts: StarCounts): RatingSummary {
  const count = counts.reduce((sum, n) => sum + n, 0);
  if (count < LIMITS.RATING_AVERAGE_MIN_COUNT) {
    return { count, average: null, distribution: null };
  }
  const total = counts.reduce((sum, n, index) => sum + n * (index + 1), 0);
  return { count, average: total / count, distribution: [...counts] };
}

/** A place's summary from {@link RatingSummaryReader.read}, which answers every place it was asked about. */
export function ratingOf(
  ratings: ReadonlyMap<string, RatingSummary>,
  placeId: string,
): RatingSummary {
  return ratings.get(placeId) ?? summariseRatings([0, 0, 0, 0, 0]);
}

interface RatingRow {
  placeId: string;
  rating: number;
  count: number;
}

/**
 * Rating summaries computed on read from published reviews, leaving out
 * authors the viewer blocked. One grouped query for any number of places.
 */
@Injectable()
export class RatingSummaryReader {
  constructor(private readonly prisma: PrismaService) {}

  /** A summary for every requested place (count 0 when it has no reviews). */
  async read(
    placeIds: readonly string[],
    viewerId: string | null,
  ): Promise<Map<string, RatingSummary>> {
    const counts = new Map<string, [number, number, number, number, number]>(
      placeIds.map((id) => [id, [0, 0, 0, 0, 0]]),
    );
    if (placeIds.length > 0) {
      const rows = await this.prisma.$queryRaw<RatingRow[]>`
        SELECT r.place_id::text AS "placeId", r.rating::int AS rating, count(*)::int AS count
        FROM reviews r
        WHERE r.place_id = ANY(${[...placeIds]}::uuid[])
          AND r.status = 'published'
          ${andAuthorNotBlockedBy(viewerId, Prisma.raw('r.author_id'))}
        GROUP BY r.place_id, r.rating`;
      for (const row of rows) {
        const perStar = counts.get(row.placeId);
        // reviews_rating_chk keeps rating within 1..5.
        if (perStar) {
          perStar[row.rating - 1] = row.count;
        }
      }
    }
    return new Map([...counts].map(([id, perStar]) => [id, summariseRatings(perStar)]));
  }
}
