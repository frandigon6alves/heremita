import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';
import { userNotBlockedBy } from '../../src/core/block-filter.js';
import { RatingSummaryReader } from '../../src/core/rating-summary.reader.js';
import { TripAccessService } from '../../src/core/trip-access.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

let database: TestDatabase;
let prisma: PrismaService;
let userCounter = 0;

async function createUser(): Promise<string> {
  userCounter += 1;
  const user = await prisma.user.create({
    data: {
      email: `core-${userCounter}@example.com`,
      passwordHash: 'unused',
      displayName: `Core ${userCounter}`,
    },
  });
  return user.id;
}

async function createPlace(osmId: number): Promise<string> {
  const place = await prisma.place.create({
    data: {
      source: 'osm',
      osmType: 'N',
      osmId: BigInt(osmId),
      name: `Place ${osmId}`,
      category: 'sight',
      lng: -9.14,
      lat: 38.71,
    },
  });
  return place.id;
}

async function review(placeId: string, authorId: string, rating: number, hidden = false) {
  await prisma.review.create({
    data: {
      placeId,
      authorId,
      rating,
      body: 'A review long enough.',
      visitedOn: new Date('2026-10-01T00:00:00.000Z'),
      language: 'en',
      status: hidden ? 'hidden' : 'published',
      hiddenAt: hidden ? new Date('2026-11-01T00:00:00.000Z') : null,
    },
  });
}

beforeAll(async () => {
  database = await createTestDatabase();
  prisma = new PrismaService(parseEnv({ ...process.env, DATABASE_URL: database.url }));
});

afterAll(async () => {
  await prisma.$disconnect();
  await database.drop();
});

describe('TripAccessService', () => {
  let access: TripAccessService;
  let ownerId: string;
  let otherId: string;
  const trips: Record<string, { id: string; shareToken: string | null }> = {};

  beforeAll(async () => {
    access = new TripAccessService(prisma);
    ownerId = await createUser();
    otherId = await createUser();
    const rows = {
      private: { visibility: 'private', shareToken: 'privateTokenKept000001' },
      link: { visibility: 'link', shareToken: 'linkToken0000000000001' },
      public: { visibility: 'public', shareToken: 'publicToken00000000001' },
      hidden: { visibility: 'public', shareToken: 'hiddenToken00000000001' },
    } as const;
    for (const [name, row] of Object.entries(rows)) {
      const trip = await prisma.trip.create({
        data: {
          ownerId,
          title: name,
          visibility: row.visibility,
          shareToken: row.shareToken,
          publishedAt: row.visibility === 'public' ? new Date('2026-11-01T00:00:00Z') : null,
          moderationHiddenAt: name === 'hidden' ? new Date('2026-11-02T00:00:00Z') : null,
        },
        select: { id: true, shareToken: true },
      });
      trips[name] = trip;
    }
  });

  function idOf(name: string): string {
    const trip = trips[name];
    if (!trip) throw new Error(`no trip ${name}`);
    return trip.id;
  }

  function tokenOf(name: string): string {
    const token = trips[name]?.shareToken;
    if (!token) throw new Error(`no token ${name}`);
    return token;
  }

  it('lets_the_owner_read_every_own_trip_by_id', async () => {
    for (const name of ['private', 'link', 'public', 'hidden']) {
      await expect(access.resolve({ tripId: idOf(name) }, { id: ownerId })).resolves.toEqual({
        tripId: idOf(name),
        role: 'owner',
      });
    }
  });

  it('lets_others_read_only_public_unhidden_trips_by_id', async () => {
    const results = await Promise.all(
      ['private', 'link', 'public', 'hidden'].map((name) =>
        access.resolve({ tripId: idOf(name) }, { id: otherId }),
      ),
    );

    expect(results.map((result) => result?.role ?? null)).toEqual([null, null, 'viewer', null]);
    await expect(access.resolve({ tripId: idOf('public') }, null)).resolves.toMatchObject({
      role: 'viewer',
    });
  });

  it('resolves_share_tokens_of_link_and_public_trips_as_viewer_for_everyone', async () => {
    for (const viewer of [null, { id: otherId }, { id: ownerId }]) {
      await expect(access.resolve({ shareToken: tokenOf('link') }, viewer)).resolves.toEqual({
        tripId: idOf('link'),
        role: 'viewer',
      });
      await expect(
        access.resolve({ shareToken: tokenOf('public') }, viewer),
      ).resolves.toMatchObject({ role: 'viewer' });
    }
  });

  it('refuses_tokens_of_private_or_hidden_trips_and_unknown_tokens', async () => {
    for (const shareToken of [tokenOf('private'), tokenOf('hidden'), 'neverIssuedToken000001']) {
      await expect(access.resolve({ shareToken }, { id: ownerId })).resolves.toBeNull();
    }
  });

  it('answers_404_trip_not_found_from_require', async () => {
    await expect(
      access.require({ tripId: idOf('private') }, { id: otherId }),
    ).rejects.toMatchObject({ code: 'trip_not_found' });
    await expect(
      access.require({ tripId: '0193a000-0000-7000-8000-00000000ffff' }, null),
    ).rejects.toMatchObject({ code: 'trip_not_found' });
  });
});

describe('RatingSummaryReader and the block filter', () => {
  let reader: RatingSummaryReader;
  let viewerId: string;
  let blockedAuthorId: string;
  let noReviews: string;
  let fivePublished: string;
  let sixPublished: string;

  beforeAll(async () => {
    reader = new RatingSummaryReader(prisma);
    viewerId = await createUser();
    blockedAuthorId = await createUser();
    await prisma.userBlock.create({ data: { blockerId: viewerId, blockedId: blockedAuthorId } });
    const authors: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      authors.push(await createUser());
    }
    const [published, hiddenAuthor] = [authors.slice(0, 5), authors.slice(5)];

    noReviews = await createPlace(9_001);

    // 5 published + 1 hidden: count 5, no average for anyone.
    fivePublished = await createPlace(9_002);
    for (const author of published) {
      await review(fivePublished, author, 4);
    }
    for (const author of hiddenAuthor) {
      await review(fivePublished, author, 1, true);
    }

    // 6 published (one by the author the viewer blocked) + 1 hidden.
    sixPublished = await createPlace(9_003);
    await review(sixPublished, blockedAuthorId, 1);
    for (const author of published) {
      await review(sixPublished, author, 5);
    }
    for (const author of hiddenAuthor) {
      await review(sixPublished, author, 2, true);
    }
  });

  it('counts_zero_for_a_place_without_reviews', async () => {
    const summaries = await reader.read([noReviews], null);

    expect(summaries.get(noReviews)).toEqual({ count: 0, average: null, distribution: null });
  });

  it('leaves_hidden_reviews_out_and_withholds_the_average_below_six', async () => {
    const summaries = await reader.read([fivePublished], null);

    expect(summaries.get(fivePublished)).toEqual({ count: 5, average: null, distribution: null });
  });

  it('shows_the_average_from_six_published_reviews', async () => {
    const summaries = await reader.read([sixPublished, noReviews], null);

    expect(summaries.get(sixPublished)).toEqual({
      count: 6,
      average: 26 / 6,
      distribution: [1, 0, 0, 0, 5],
    });
    expect(summaries.size).toBe(2);
  });

  it('drops_authors_the_viewer_blocked_from_counts_and_averages', async () => {
    const summaries = await reader.read([sixPublished], viewerId);

    expect(summaries.get(sixPublished)).toEqual({ count: 5, average: null, distribution: null });
  });

  it('applies_the_same_filter_to_prisma_queries', async () => {
    const forViewer = await prisma.review.count({
      where: { placeId: sixPublished, status: 'published', author: userNotBlockedBy(viewerId) },
    });
    const anonymous = await prisma.review.count({
      where: { placeId: sixPublished, status: 'published', author: userNotBlockedBy(null) },
    });

    expect([forViewer, anonymous]).toEqual([5, 6]);
  });

  it('reads_nothing_for_no_places', async () => {
    await expect(reader.read([], viewerId)).resolves.toEqual(new Map());
  });
});
