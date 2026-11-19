import {
  API_PREFIX,
  endpoints,
  LIMITS,
  problemDetailsSchema,
  type Page,
  type PutReviewBody,
  type Review,
} from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';
import { createUser, type TestUser } from '../support/factories.js';
import { sendRaw, type HttpClient } from '../support/http.js';
import { insertBlock, insertPlace, insertReview, insertTrip } from '../users/content.js';

const UNKNOWN_ID = '019a0000-0000-7000-8000-000000000000';
const MINUTE_MS = 60_000;
const BODY: PutReviewBody = {
  rating: 4,
  body: 'Worth the queue at opening time.',
  visitedMonth: '2026-10',
};

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

function problemOf(response: { body: unknown }) {
  return problemDetailsSchema.parse(response.body);
}

/** Each call is one minute later than the previous one, so rows sort by creation. */
function nextMinute(): Date {
  t.clock.advance(MINUTE_MS);
  return t.clock.now();
}

async function reviewsOf(
  client: HttpClient,
  placeId: string,
  query: Record<string, unknown> = {},
): Promise<{ status: number; body: Page<Review> }> {
  const response = await sendRaw(client, endpoints.listPlaceReviews, {
    params: { placeId },
    query,
  });
  return { status: response.status, body: response.body as Page<Review> };
}

function putReview(client: HttpClient, placeId: string, body: unknown = BODY) {
  return sendRaw(client, endpoints.putMyReview, { params: { placeId }, body });
}

function deleteReview(client: HttpClient, placeId: string) {
  return sendRaw(client, endpoints.deleteMyReview, { params: { placeId } });
}

/** An anonymous unsafe request that passes the CSRF check, so only the session guard answers. */
function anonymousPut(placeId: string) {
  return putReview(t.http, placeId).set('Origin', WEB_ORIGIN);
}

function idsOf(page: Page<Review>): string[] {
  return page.items.map((review) => review.id);
}

/** Walks every page of a list with `limit`, returning the ids in order. */
async function allIds(placeId: string, query: Record<string, unknown>): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await reviewsOf(t.http, placeId, { ...query, ...(cursor && { cursor }) });
    expect(page.status).toBe(200);
    ids.push(...idsOf(page.body));
    cursor = page.body.nextCursor;
  } while (cursor);
  return ids;
}

async function customPlaceOf(owner: TestUser): Promise<string> {
  const tripId = await insertTrip(t, owner.user.id, { customPlace: true });
  const place = await t.prisma.place.findFirstOrThrow({
    where: { tripId },
    select: { id: true },
  });
  return place.id;
}

describe('E45 listPlaceReviews', () => {
  it('lists_published_reviews_newest_first_for_anyone', async () => {
    const placeId = await insertPlace(t);
    const [older, newer] = [await createUser(t), await createUser(t)];
    const first = await insertReview(t, older.user.id, placeId, { createdAt: nextMinute() });
    const second = await insertReview(t, newer.user.id, placeId, {
      rating: 2,
      createdAt: nextMinute(),
    });

    const response = await reviewsOf(t.http, placeId);

    expect(response.status).toBe(200);
    expect(idsOf(response.body)).toEqual([second, first]);
    expect(response.body.nextCursor).toBeNull();
    expect(response.body.items[0]).toMatchObject({
      rating: 2,
      body: 'Vista linda ao fim da tarde.',
      visitedMonth: '2026-09',
      language: 'pt-BR',
      status: 'published',
      isMine: false,
      author: { id: newer.user.id, displayName: 'Test Traveller', isDemo: false },
      place: { id: placeId, name: 'Miradouro', category: 'sight' },
    });
  });

  it('is_empty_for_a_place_without_reviews', async () => {
    const placeId = await insertPlace(t);

    const response = await reviewsOf(t.http, placeId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it('pages_recent_reviews_without_gaps_or_repeats', async () => {
    const placeId = await insertPlace(t);
    const createdAt = nextMinute();
    const expected: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const author = await createUser(t);
      // Three share one timestamp, so the id tie-break decides their order.
      const at = index < 3 ? createdAt : nextMinute();
      expected.push(await insertReview(t, author.user.id, placeId, { createdAt: at }));
    }
    const newestFirst = [...expected.slice(3).reverse(), ...expected.slice(0, 3).sort().reverse()];

    expect(await allIds(placeId, { limit: 2 })).toEqual(newestFirst);
  });

  it('ends_with_a_null_cursor_when_the_last_page_is_exactly_full', async () => {
    const placeId = await insertPlace(t);
    for (let index = 0; index < 2; index += 1) {
      const author = await createUser(t);
      await insertReview(t, author.user.id, placeId, { createdAt: nextMinute() });
    }

    const first = await reviewsOf(t.http, placeId, { limit: 1 });
    const second = await reviewsOf(t.http, placeId, {
      limit: 1,
      cursor: first.body.nextCursor,
    });

    expect(first.body.nextCursor).not.toBeNull();
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('sorts_lowest_rating_first_then_newest_across_pages', async () => {
    const placeId = await insertPlace(t);
    const write = async (rating: number) => {
      const author = await createUser(t);
      return insertReview(t, author.user.id, placeId, { rating, createdAt: nextMinute() });
    };
    const fiveOld = await write(5);
    const twoOld = await write(2);
    const oneOnly = await write(1);
    const twoNew = await write(2);
    const fiveNew = await write(5);

    expect(await allIds(placeId, { sort: 'lowest', limit: 2 })).toEqual([
      oneOnly,
      twoNew,
      twoOld,
      fiveNew,
      fiveOld,
    ]);
  });

  it('shows_a_hidden_review_only_to_its_author (V8)', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);
    const other = await createUser(t);
    const hidden = await insertReview(t, author.user.id, placeId, { hidden: true });

    const forAuthor = await reviewsOf(author.agent, placeId);
    const forOther = await reviewsOf(other.agent, placeId);
    const forAnonymous = await reviewsOf(t.http, placeId);

    expect(forAuthor.body.items).toEqual([
      expect.objectContaining({ id: hidden, status: 'hidden', isMine: true }),
    ]);
    expect(forOther.body.items).toEqual([]);
    expect(forAnonymous.body.items).toEqual([]);
  });

  it('marks_the_viewers_own_review_as_mine', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);
    await insertReview(t, author.user.id, placeId);

    const response = await reviewsOf(author.agent, placeId);

    expect(response.body.items[0]?.isMine).toBe(true);
  });

  it('leaves_out_authors_the_viewer_blocked (V9)', async () => {
    const placeId = await insertPlace(t);
    const [blocked, kept, viewer] = [await createUser(t), await createUser(t), await createUser(t)];
    await insertReview(t, blocked.user.id, placeId, { createdAt: nextMinute() });
    const keptReview = await insertReview(t, kept.user.id, placeId, { createdAt: nextMinute() });
    await insertBlock(t, viewer.user.id, blocked.user.id);

    const response = await reviewsOf(viewer.agent, placeId);

    expect(idsOf(response.body)).toEqual([keptReview]);
    expect((await reviewsOf(t.http, placeId)).body.items).toHaveLength(2);
  });

  it.each([
    ['an_unknown_place', () => Promise.resolve(UNKNOWN_ID)],
    ['a_malformed_id', () => Promise.resolve('nope')],
    ['a_custom_place (V11)', async () => customPlaceOf(await createUser(t))],
  ])('answers_place_not_found_for_%s', async (_case, placeIdOf) => {
    const response = await sendRaw(t.http, endpoints.listPlaceReviews, {
      params: { placeId: await placeIdOf() },
    });

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('place_not_found');
  });

  it.each([
    ['a_tampered_cursor', { cursor: 'bm9wZQ' }],
    ['a_recent_cursor_used_for_lowest', { sort: 'lowest' }],
  ])('rejects_%s_with_invalid_cursor', async (_case, query) => {
    const placeId = await insertPlace(t);
    for (let index = 0; index < 2; index += 1) {
      const author = await createUser(t);
      await insertReview(t, author.user.id, placeId, { createdAt: nextMinute() });
    }
    const recent = await reviewsOf(t.http, placeId, { limit: 1 });

    const response = await sendRaw(t.http, endpoints.listPlaceReviews, {
      params: { placeId },
      query: { cursor: recent.body.nextCursor, ...query },
    });

    expect(response.status).toBe(422);
    expect(problemOf(response)).toMatchObject({
      code: 'invalid_cursor',
      errors: [{ pointer: '/query/cursor' }],
    });
  });

  it.each([
    ['limit_above_the_maximum', { limit: LIMITS.PAGE_SIZES.reviews.max + 1 }, '/query/limit'],
    ['limit_zero', { limit: 0 }, '/query/limit'],
    ['an_unknown_sort', { sort: 'highest' }, '/query/sort'],
  ])('rejects_%s', async (_case, query, pointer) => {
    const placeId = await insertPlace(t);

    const response = await sendRaw(t.http, endpoints.listPlaceReviews, {
      params: { placeId },
      query,
    });

    expect(response.status).toBe(422);
    expect(problemOf(response)).toMatchObject({
      code: 'validation_failed',
      errors: [expect.objectContaining({ pointer })],
    });
  });

  it('accepts_the_maximum_limit', async () => {
    const placeId = await insertPlace(t);

    const response = await reviewsOf(t.http, placeId, { limit: LIMITS.PAGE_SIZES.reviews.max });

    expect(response.status).toBe(200);
  });
});

describe('E46 putMyReview', () => {
  it('creates_the_review_with_201_and_location_in_the_callers_locale', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t, { locale: 'en' });

    const response = await putReview(author.agent, placeId);

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`${API_PREFIX}/places/${placeId}/reviews/mine`);
    expect(response.body).toMatchObject({
      ...BODY,
      language: 'en',
      status: 'published',
      isMine: true,
      createdAt: t.clock.now().toISOString(),
      updatedAt: t.clock.now().toISOString(),
      place: { id: placeId },
      author: { id: author.user.id },
    });
    expect((await reviewsOf(t.http, placeId)).body.items).toHaveLength(1);
  });

  it('tags_a_spanish_authors_review_as_spanish', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t, { locale: 'es' });

    const response = await putReview(author.agent, placeId);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ language: 'es' });
  });

  it('replaces_the_callers_review_with_200 (V49)', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);
    const created = (await putReview(author.agent, placeId)).body as Review;
    nextMinute();

    const response = await putReview(author.agent, placeId, {
      rating: 2,
      body: 'Crowded now, go early.',
      visitedMonth: '2026-11',
    });

    expect(response.status).toBe(200);
    expect(response.headers.location).toBeUndefined();
    expect(response.body).toMatchObject({
      id: created.id,
      rating: 2,
      body: 'Crowded now, go early.',
      visitedMonth: '2026-11',
      createdAt: created.createdAt,
      updatedAt: t.clock.now().toISOString(),
    });
    expect(await t.prisma.review.count({ where: { placeId } })).toBe(1);
  });

  it('keeps_a_hidden_review_hidden_when_its_author_edits_it', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);
    await insertReview(t, author.user.id, placeId, { hidden: true });

    const response = await putReview(author.agent, placeId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'hidden', body: BODY.body });
    expect((await reviewsOf(t.http, placeId)).body.items).toEqual([]);
  });

  it('stores_the_body_after_cleanText (V16)', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);

    const response = await putReview(author.agent, placeId, {
      ...BODY,
      body: '  ‮worth it\u0007 at dusk  ',
    });

    expect(response.body).toMatchObject({ body: 'worth it at dusk' });
  });

  it('accepts_the_current_month', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);

    const response = await putReview(author.agent, placeId, { ...BODY, visitedMonth: '2026-11' });

    expect(response.status).toBe(201);
  });

  it.each([
    ['a_future_month', { ...BODY, visitedMonth: '2026-12' }, '/body/visitedMonth'],
    ['a_malformed_month', { ...BODY, visitedMonth: '2026-13' }, '/body/visitedMonth'],
    ['a_body_too_short_after_cleaning', { ...BODY, body: '   short   ' }, '/body/body'],
    ['a_body_too_long', { ...BODY, body: 'x'.repeat(LIMITS.REVIEW_BODY_MAX + 1) }, '/body/body'],
    ['a_rating_of_zero', { ...BODY, rating: 0 }, '/body/rating'],
    ['a_rating_of_six', { ...BODY, rating: 6 }, '/body/rating'],
    ['an_unknown_field', { ...BODY, status: 'published' }, '/body/status'],
  ])('rejects_%s_with_a_pointer (V49)', async (_case, body, pointer) => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);

    const response = await putReview(author.agent, placeId, body);

    expect(response.status).toBe(422);
    expect(problemOf(response)).toMatchObject({
      code: 'validation_failed',
      errors: [expect.objectContaining({ pointer })],
    });
    expect(await t.prisma.review.count({ where: { placeId } })).toBe(0);
  });

  it('asks_anonymous_callers_to_sign_in', async () => {
    const placeId = await insertPlace(t);

    const response = await anonymousPut(placeId);

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('unauthenticated');
  });

  it.each([
    ['an_unknown_place', () => Promise.resolve(UNKNOWN_ID)],
    ['a_custom_place (V11)', async () => customPlaceOf(await createUser(t))],
  ])('answers_place_not_found_for_%s', async (_case, placeIdOf) => {
    const author = await createUser(t);
    const placeId = await placeIdOf();

    const response = await putReview(author.agent, placeId);

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('place_not_found');
    expect(await t.prisma.review.count({ where: { placeId } })).toBe(0);
  });

  it('throttles_an_author_after_ten_writes_an_hour', async () => {
    const author = await createUser(t);
    const placeId = await insertPlace(t);
    for (let index = 0; index < 10; index += 1) {
      expect((await putReview(author.agent, placeId)).status).toBeLessThan(300);
    }

    const response = await putReview(author.agent, placeId);

    expect(response.status).toBe(429);
    expect(problemOf(response).code).toBe('rate_limited');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('E47 deleteMyReview', () => {
  it('deletes_the_callers_review_and_nobody_elses', async () => {
    const placeId = await insertPlace(t);
    const [author, other] = [await createUser(t), await createUser(t)];
    await insertReview(t, author.user.id, placeId);
    const kept = await insertReview(t, other.user.id, placeId);

    const response = await deleteReview(author.agent, placeId);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(idsOf((await reviewsOf(t.http, placeId)).body)).toEqual([kept]);
  });

  it('answers_204_again_when_nothing_is_left_to_delete (V27)', async () => {
    const placeId = await insertPlace(t);
    const author = await createUser(t);
    await insertReview(t, author.user.id, placeId);
    await deleteReview(author.agent, placeId);

    const response = await deleteReview(author.agent, placeId);

    expect(response.status).toBe(204);
  });

  it('asks_anonymous_callers_to_sign_in', async () => {
    const placeId = await insertPlace(t);

    const response = await deleteReview(t.http, placeId).set('Origin', WEB_ORIGIN);

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('unauthenticated');
  });

  it.each([
    ['an_unknown_place', () => Promise.resolve(UNKNOWN_ID)],
    ['a_custom_place (V11)', async () => customPlaceOf(await createUser(t))],
  ])('answers_place_not_found_for_%s', async (_case, placeIdOf) => {
    const author = await createUser(t);

    const response = await deleteReview(author.agent, await placeIdOf());

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('place_not_found');
  });
});
