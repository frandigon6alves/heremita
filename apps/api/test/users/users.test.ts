import { endpoints, type Page, type PublicTripCard, type Review } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../support/app.js';
import { cardOf, nextMinute, problemOf, UNKNOWN_ID } from '../support/assertions.js';
import { createUser, type TestUser } from '../support/factories.js';
import { sendRaw, type HttpClient } from '../support/http.js';
import { insertBlock, insertPlace, insertReview, insertTrip } from './content.js';

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

function anonymous(): HttpClient {
  return t.http;
}

function profileOf(client: HttpClient, userId: string) {
  return sendRaw(client, endpoints.getUserProfile, { params: { userId } });
}

async function tripsOf(
  client: HttpClient,
  userId: string,
  query: Record<string, unknown> = {},
): Promise<{ status: number; body: Page<PublicTripCard> }> {
  const response = await sendRaw(client, endpoints.listUserTrips, { params: { userId }, query });
  return { status: response.status, body: response.body as Page<PublicTripCard> };
}

async function reviewsOf(
  client: HttpClient,
  userId: string,
  query: Record<string, unknown> = {},
): Promise<{ status: number; body: Page<Review> }> {
  const response = await sendRaw(client, endpoints.listUserReviews, { params: { userId }, query });
  return { status: response.status, body: response.body as Page<Review> };
}

/** One public trip, one review and one hidden review per author; the trip list ignores the rest. */
async function authorWithContent(): Promise<{ author: TestUser; tripId: string }> {
  const author = await createUser(t);
  const [first, second] = [await insertPlace(t), await insertPlace(t)];
  const tripId = await insertTrip(t, author.user.id, {
    visibility: 'public',
    publishedAt: nextMinute(t),
    stops: [first],
  });
  await insertTrip(t, author.user.id, { visibility: 'link' });
  await insertTrip(t, author.user.id);
  await insertTrip(t, author.user.id, {
    visibility: 'public',
    publishedAt: nextMinute(t),
    hiddenAt: nextMinute(t),
  });
  await insertReview(t, author.user.id, first, { createdAt: nextMinute(t) });
  await insertReview(t, author.user.id, second, { createdAt: nextMinute(t), hidden: true });
  return { author, tripId };
}

describe('E15 getUserProfile', () => {
  it('shows_listed_counts_to_anyone', async () => {
    const { author } = await authorWithContent();

    const response = await profileOf(anonymous(), author.user.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...cardOf(author),
      joinedMonth: '2026-11',
      publicTripCount: 1,
      reviewCount: 1,
    });
  });

  it('counts_own_hidden_reviews_for_the_author (V8)', async () => {
    const { author } = await authorWithContent();

    const response = await profileOf(author.agent, author.user.id);

    expect(response.body).toMatchObject({ publicTripCount: 1, reviewCount: 2 });
  });

  it('counts_nothing_for_a_viewer_who_blocked_the_user (V9)', async () => {
    const { author } = await authorWithContent();
    const blocker = await createUser(t);
    await insertBlock(t, blocker.user.id, author.user.id);

    const response = await profileOf(blocker.agent, author.user.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ publicTripCount: 0, reviewCount: 0 });
  });

  it.each([
    ['an_unknown_user', UNKNOWN_ID],
    ['a_malformed_id', 'nope'],
  ])('answers_user_not_found_for_%s', async (_case, userId) => {
    const response = await profileOf(anonymous(), userId);

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('user_not_found');
  });
});

describe('E16 listUserTrips', () => {
  it('lists_public_unhidden_trips_as_cards', async () => {
    const { author, tripId } = await authorWithContent();
    const stops = [await insertPlace(t), await insertPlace(t)];
    const idea = await insertPlace(t);
    const publishedAt = nextMinute(t);
    const latest = await insertTrip(t, author.user.id, {
      visibility: 'public',
      publishedAt,
      title: 'Porto',
      stops: [stops[0] ?? ''],
      secondDayStops: [stops[1] ?? ''],
      ideas: [idea],
    });
    const copier = await createUser(t);
    await insertTrip(t, copier.user.id, { copiedFromTripId: latest });
    const places = await t.prisma.place.findMany({ where: { id: { in: [...stops, idea] } } });
    const location = (id: string | undefined) => {
      const place = places.find((row) => row.id === id);
      return { lng: place?.lng, lat: place?.lat };
    };

    const response = await tripsOf(anonymous(), author.user.id);

    expect(response.status).toBe(200);
    const { items } = response.body;
    expect(items.map((card) => card.id)).toEqual([latest, tripId]);
    expect(items[0]).toEqual({
      id: latest,
      title: 'Porto',
      destinationName: 'Lisboa',
      countryCode: 'PT',
      dayCount: 2,
      placeCount: 3,
      defaultMode: 'walk',
      copyCount: 1,
      author: cardOf(author),
      previewPoints: [location(stops[0]), location(stops[1]), location(idea)],
      publishedAt: publishedAt.toISOString(),
    });
    expect(response.body.nextCursor).toBeNull();
  });

  it('caps_preview_points_at_20', async () => {
    const author = await createUser(t);
    const places: string[] = [];
    for (let index = 0; index < 22; index += 1) {
      places.push(await insertPlace(t));
    }
    await insertTrip(t, author.user.id, {
      visibility: 'public',
      stops: places.slice(0, 12),
      secondDayStops: places.slice(12),
    });

    const response = await tripsOf(anonymous(), author.user.id);

    expect(response.body.items[0]?.previewPoints).toHaveLength(20);
  });

  it('is_empty_for_a_viewer_who_blocked_the_author (V9)', async () => {
    const { author } = await authorWithContent();
    const blocker = await createUser(t);
    await insertBlock(t, blocker.user.id, author.user.id);

    const response = await tripsOf(blocker.agent, author.user.id);

    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it('hides_hidden_trips_from_their_owner_too (V8)', async () => {
    const author = await createUser(t);
    await insertTrip(t, author.user.id, { visibility: 'public', hiddenAt: nextMinute(t) });

    const response = await tripsOf(author.agent, author.user.id);

    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  describe('pagination (V26)', () => {
    async function authorOf(count: number): Promise<{ author: TestUser; newestFirst: string[] }> {
      const author = await createUser(t);
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        ids.unshift(
          await insertTrip(t, author.user.id, { visibility: 'public', publishedAt: nextMinute(t) }),
        );
      }
      return { author, newestFirst: ids };
    }

    const idsOf = (body: { items: PublicTripCard[] }) => body.items.map((card) => card.id);

    it.each([0, 1, 2])('fits_%i_trips_in_one_page_of_2', async (count) => {
      const { author, newestFirst } = await authorOf(count);

      const response = await tripsOf(anonymous(), author.user.id, { limit: 2 });

      expect(idsOf(response.body)).toEqual(newestFirst);
      expect(response.body.nextCursor).toBeNull();
    });

    it('pages_3_trips_newest_first', async () => {
      const { author, newestFirst } = await authorOf(3);

      const first = await tripsOf(anonymous(), author.user.id, { limit: 2 });
      const second = await tripsOf(anonymous(), author.user.id, {
        limit: 2,
        cursor: first.body.nextCursor,
      });

      expect(idsOf(first.body)).toEqual(newestFirst.slice(0, 2));
      expect(first.body.nextCursor).toEqual(expect.any(String));
      expect(idsOf(second.body)).toEqual(newestFirst.slice(2));
      expect(second.body.nextCursor).toBeNull();
    });

    it('breaks_ties_on_the_same_instant_by_id', async () => {
      const author = await createUser(t);
      const publishedAt = nextMinute(t);
      const ids: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        ids.push(await insertTrip(t, author.user.id, { visibility: 'public', publishedAt }));
      }

      const first = await tripsOf(anonymous(), author.user.id, { limit: 2 });
      const second = await tripsOf(anonymous(), author.user.id, {
        limit: 2,
        cursor: first.body.nextCursor,
      });

      expect([...idsOf(first.body), ...idsOf(second.body)]).toEqual(
        ids.sort((a, b) => b.localeCompare(a)),
      );
    });

    it('rejects_a_cursor_of_another_list', async () => {
      const author = await createUser(t);
      const cursor = Buffer.from(JSON.stringify([5, '2026-11-18T10:00:00.000Z', UNKNOWN_ID]));

      const response = await tripsOf(anonymous(), author.user.id, {
        cursor: cursor.toString('base64url'),
      });

      expect(response.status).toBe(422);
      expect(problemOf(response).code).toBe('invalid_cursor');
    });

    it('rejects_a_limit_over_30', async () => {
      const author = await createUser(t);

      const response = await tripsOf(anonymous(), author.user.id, { limit: 31 });

      expect(response.status).toBe(422);
      expect(problemOf(response).errors?.map((error) => error.pointer)).toEqual(['/query/limit']);
    });
  });

  it('answers_user_not_found_for_an_unknown_user', async () => {
    const response = await tripsOf(anonymous(), UNKNOWN_ID);

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('user_not_found');
  });
});

describe('E17 listUserReviews', () => {
  it('lists_published_reviews_to_others', async () => {
    const { author } = await authorWithContent();
    const viewer = await createUser(t);

    const response = await reviewsOf(viewer.agent, author.user.id);

    expect(response.status).toBe(200);
    const { items } = response.body;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      place: { name: 'Miradouro', category: 'sight' },
      rating: 4,
      body: 'Vista linda ao fim da tarde.',
      visitedMonth: '2026-09',
      language: 'pt-BR',
      author: cardOf(author),
      status: 'published',
      isMine: false,
    });
  });

  it('shows_the_author_their_hidden_reviews_newest_first (V8)', async () => {
    const { author } = await authorWithContent();

    const response = await reviewsOf(author.agent, author.user.id);

    const { items } = response.body;
    expect(items.map((review) => [review.status, review.isMine])).toEqual([
      ['hidden', true],
      ['published', true],
    ]);
  });

  it('is_empty_for_a_viewer_who_blocked_the_author (V9)', async () => {
    const { author } = await authorWithContent();
    const blocker = await createUser(t);
    await insertBlock(t, blocker.user.id, author.user.id);

    const response = await reviewsOf(blocker.agent, author.user.id);

    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  describe('pagination (V26)', () => {
    async function reviewerOf(count: number): Promise<{ author: TestUser; newestFirst: string[] }> {
      const author = await createUser(t);
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const placeId = await insertPlace(t);
        ids.unshift(await insertReview(t, author.user.id, placeId, { createdAt: nextMinute(t) }));
      }
      return { author, newestFirst: ids };
    }

    const idsOf = (body: { items: Review[] }) => body.items.map((review) => review.id);

    it.each([0, 1, 2])('fits_%i_reviews_in_one_page_of_2', async (count) => {
      const { author, newestFirst } = await reviewerOf(count);

      const response = await reviewsOf(anonymous(), author.user.id, { limit: 2 });

      expect(idsOf(response.body)).toEqual(newestFirst);
      expect(response.body.nextCursor).toBeNull();
    });

    it('pages_3_reviews_newest_first', async () => {
      const { author, newestFirst } = await reviewerOf(3);

      const first = await reviewsOf(anonymous(), author.user.id, { limit: 2 });
      const second = await reviewsOf(anonymous(), author.user.id, {
        limit: 2,
        cursor: first.body.nextCursor,
      });

      expect(idsOf(first.body)).toEqual(newestFirst.slice(0, 2));
      expect(idsOf(second.body)).toEqual(newestFirst.slice(2));
      expect(second.body.nextCursor).toBeNull();
    });

    it('rejects_a_tampered_cursor', async () => {
      const author = await createUser(t);

      const response = await reviewsOf(anonymous(), author.user.id, { cursor: 'AAAA' });

      expect(response.status).toBe(422);
      expect(problemOf(response).code).toBe('invalid_cursor');
    });
  });

  it('answers_user_not_found_for_an_unknown_user', async () => {
    const response = await reviewsOf(anonymous(), UNKNOWN_ID);

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('user_not_found');
  });
});
