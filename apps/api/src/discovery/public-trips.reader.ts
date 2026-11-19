import { Injectable } from '@nestjs/common';
import type { Page, PublicTripCard, TravelMode } from '@heremita/shared';
import { andAuthorNotBlockedBy } from '../core/block-filter.js';
import { CURSOR_TUPLES, decodeCursor, toPage } from '../core/cursor.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PreviewPointsReader } from '../trips/preview-points.reader.js';

export interface PublicTripsFilter {
  viewerId: string | null;
  /** Words matched, accents and case aside, anywhere in the title or destination. */
  q?: string;
  /** Upper-case ISO 3166-1 alpha-2 code of the destination. */
  countryCode?: string;
  /** Only this author's trips (a profile page). */
  ownerId?: string;
  limit: number;
  cursor?: string;
}

interface CardRow {
  id: string;
  title: string;
  destinationName: string | null;
  countryCode: string | null;
  defaultMode: TravelMode;
  publishedAt: Date;
  authorId: string;
  authorName: string;
  authorIsDemo: boolean;
  dayCount: number;
  placeCount: number;
  copyCount: number;
}

/** `%`, `_` and `\` in the user's text match themselves, not any characters. */
function likePattern(text: string): string {
  return `%${text.replaceAll(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Public, unhidden trips, newest publication first, without authors the
 * viewer blocked: one query for the page and one for its preview points.
 */
@Injectable()
export class PublicTripsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previews: PreviewPointsReader,
  ) {}

  async page(filter: PublicTripsFilter): Promise<Page<PublicTripCard>> {
    const after = decodeCursor(CURSOR_TUPLES.publishedTrips, filter.cursor);
    const conditions: Prisma.Sql[] = [
      Prisma.sql`t.visibility = 'public'`,
      Prisma.sql`t.moderation_hidden_at IS NULL`,
    ];
    if (filter.q !== undefined) {
      // SHORTCUT(owner): public-trip text search is ILIKE over title and destination — ceiling: a few thousand public trips; upgrade: when p95 of /public-trips passes 200 ms, add pg_trgm or full-text search
      conditions.push(
        Prisma.sql`unaccent(lower(concat_ws(' ', t.title, t.destination_name))) ILIKE unaccent(lower(${likePattern(filter.q)}))`,
      );
    }
    if (filter.countryCode !== undefined) {
      conditions.push(Prisma.sql`t.destination_country_code = ${filter.countryCode}`);
    }
    if (filter.ownerId !== undefined) {
      conditions.push(Prisma.sql`t.owner_id = ${filter.ownerId}::uuid`);
    }
    if (after) {
      conditions.push(Prisma.sql`(t.published_at, t.id) < (${after[0]}, ${after[1]}::uuid)`);
    }
    const rows = await this.prisma.$queryRaw<CardRow[]>`
      SELECT t.id::text AS id, t.title, t.destination_name AS "destinationName",
        t.destination_country_code AS "countryCode", t.default_mode::text AS "defaultMode",
        t.published_at AS "publishedAt", u.id::text AS "authorId",
        u.display_name AS "authorName", u.is_demo AS "authorIsDemo",
        (SELECT count(*) FROM days d WHERE d.trip_id = t.id)::int AS "dayCount",
        (SELECT count(*) FROM trip_places tp WHERE tp.trip_id = t.id)::int AS "placeCount",
        (SELECT count(*) FROM trips c WHERE c.copied_from_trip_id = t.id)::int AS "copyCount"
      FROM trips t
      JOIN users u ON u.id = t.owner_id
      WHERE ${Prisma.join(conditions, ' AND ')}
        ${andAuthorNotBlockedBy(filter.viewerId, Prisma.raw('t.owner_id'))}
      ORDER BY t.published_at DESC, t.id DESC
      LIMIT ${filter.limit + 1}`;
    const page = toPage(rows, filter.limit, CURSOR_TUPLES.publishedTrips, (row) => [
      row.publishedAt,
      row.id,
    ]);
    const points = await this.previews.read(page.items.map((row) => row.id));
    return {
      items: page.items.map((row) => ({
        id: row.id,
        title: row.title,
        destinationName: row.destinationName,
        countryCode: row.countryCode,
        dayCount: row.dayCount,
        placeCount: row.placeCount,
        defaultMode: row.defaultMode,
        copyCount: row.copyCount,
        author: { id: row.authorId, displayName: row.authorName, isDemo: row.authorIsDemo },
        previewPoints: points.get(row.id) ?? [],
        publishedAt: row.publishedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
