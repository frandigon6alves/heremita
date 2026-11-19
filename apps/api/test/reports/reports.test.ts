import { API_PREFIX, endpoints, LIMITS, problemDetailsSchema } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';
import { createUser, type TestUser } from '../support/factories.js';
import { sendRaw, type HttpClient } from '../support/http.js';
import { insertPlace, insertReview, insertTrip, type TripRows } from '../users/content.js';

const UNKNOWN_ID = '019a0000-0000-7000-8000-000000000000';

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

function report(client: HttpClient, body: unknown) {
  return sendRaw(client, endpoints.createReport, { body }).set('Origin', WEB_ORIGIN);
}

function onTrip(id: string, extra: Record<string, unknown> = {}) {
  return { target: { type: 'trip', id }, reason: 'spam', ...extra };
}

function onReview(id: string, extra: Record<string, unknown> = {}) {
  return { target: { type: 'review', id }, reason: 'offensive', ...extra };
}

async function tripOf(owner: TestUser, rows: TripRows = { visibility: 'public' }): Promise<string> {
  return insertTrip(t, owner.user.id, rows);
}

async function reviewOf(author: TestUser, hidden = false): Promise<string> {
  return insertReview(t, author.user.id, await insertPlace(t), { hidden });
}

describe('E49 createReport', () => {
  it('files_a_report_on_a_public_trip_with_201_and_location', async () => {
    const [owner, reporter] = [await createUser(t), await createUser(t)];
    const tripId = await tripOf(owner);

    const response = await report(
      reporter.agent,
      onTrip(tripId, { details: '  Ad\u0007 links  ' }),
    );

    expect(response.status).toBe(201);
    const { id } = response.body as { id: string };
    expect(response.headers.location).toBe(`${API_PREFIX}/moderation/reports/${id}`);
    const row = await t.prisma.report.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      reporterId: reporter.user.id,
      targetType: 'trip',
      tripId,
      reviewId: null,
      reason: 'spam',
      details: 'Ad links',
      status: 'open',
      createdAt: t.clock.now(),
    });
  });

  it('files_a_report_on_a_published_review', async () => {
    const [author, reporter] = [await createUser(t), await createUser(t)];
    const reviewId = await reviewOf(author);

    const response = await report(reporter.agent, onReview(reviewId));

    expect(response.status).toBe(201);
    const row = await t.prisma.report.findUniqueOrThrow({
      where: { id: (response.body as { id: string }).id },
    });
    expect(row).toMatchObject({ targetType: 'review', reviewId, tripId: null, details: null });
  });

  it('accepts_a_link_trip_its_reader_knows_the_id_of', async () => {
    const [owner, reporter] = [await createUser(t), await createUser(t)];
    const tripId = await tripOf(owner, { visibility: 'link' });

    const response = await report(reporter.agent, onTrip(tripId));

    expect(response.status).toBe(201);
  });

  it('stores_blank_details_as_null', async () => {
    const [owner, reporter] = [await createUser(t), await createUser(t)];
    const tripId = await tripOf(owner);

    const response = await report(reporter.agent, onTrip(tripId, { details: '   ' }));

    const row = await t.prisma.report.findUniqueOrThrow({
      where: { id: (response.body as { id: string }).id },
    });
    expect(row.details).toBeNull();
  });

  it('leaves_content_visible_however_many_reports_arrive (V50)', async () => {
    const author = await createUser(t);
    const placeId = await insertPlace(t);
    const reviewId = await insertReview(t, author.user.id, placeId);
    for (let index = 0; index < 5; index += 1) {
      const reporter = await createUser(t);
      expect((await report(reporter.agent, onReview(reviewId))).status).toBe(201);
    }

    const listed = await sendRaw(t.http, endpoints.listPlaceReviews, { params: { placeId } });

    expect(await t.prisma.review.findUniqueOrThrow({ where: { id: reviewId } })).toMatchObject({
      status: 'published',
      hiddenAt: null,
    });
    expect(listed.body).toMatchObject({ items: [{ id: reviewId }] });
  });

  it('refuses_a_second_report_on_the_same_target_with_409 (V50)', async () => {
    const [owner, reporter] = [await createUser(t), await createUser(t)];
    const tripId = await tripOf(owner);
    await report(reporter.agent, onTrip(tripId));

    const response = await report(reporter.agent, onTrip(tripId, { reason: 'other' }));

    expect(response.status).toBe(409);
    expect(problemOf(response).code).toBe('already_reported');
    expect(await t.prisma.report.count({ where: { tripId } })).toBe(1);
  });

  it('lets_other_users_report_the_same_target', async () => {
    const [owner, first, second] = [await createUser(t), await createUser(t), await createUser(t)];
    const tripId = await tripOf(owner);
    await report(first.agent, onTrip(tripId));

    const response = await report(second.agent, onTrip(tripId));

    expect(response.status).toBe(201);
  });

  it.each([
    ['public_trip', async (me: TestUser) => onTrip(await tripOf(me))],
    ['private_trip', async (me: TestUser) => onTrip(await tripOf(me, { visibility: 'private' }))],
    ['review', async (me: TestUser) => onReview(await reviewOf(me))],
    ['hidden_review', async (me: TestUser) => onReview(await reviewOf(me, true))],
  ])('refuses_reports_on_own_%s_with_422', async (_case, bodyOf) => {
    const me = await createUser(t);

    const response = await report(me.agent, await bodyOf(me));

    expect(response.status).toBe(422);
    expect(problemOf(response).code).toBe('cannot_report_own');
  });

  it.each([
    ['an_unknown_trip', () => Promise.resolve(onTrip(UNKNOWN_ID))],
    ['an_unknown_review', () => Promise.resolve(onReview(UNKNOWN_ID))],
    ['a_review_id_sent_as_a_trip', async (other: TestUser) => onTrip(await reviewOf(other))],
    [
      'a_private_trip',
      async (other: TestUser) => onTrip(await tripOf(other, { visibility: 'private' })),
    ],
    [
      'a_moderation_hidden_trip',
      async (other: TestUser) =>
        onTrip(await tripOf(other, { visibility: 'public', hiddenAt: t.clock.now() })),
    ],
    [
      'someone_elses_hidden_review',
      async (other: TestUser) => onReview(await reviewOf(other, true)),
    ],
  ])('answers_not_found_for_%s', async (_case, bodyOf) => {
    const [other, reporter] = [await createUser(t), await createUser(t)];

    const response = await report(reporter.agent, await bodyOf(other));

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('not_found');
    expect(await t.prisma.report.count({ where: { reporterId: reporter.user.id } })).toBe(0);
  });

  it.each([
    ['a_malformed_target_id', onTrip('nope'), '/body/target/id'],
    [
      'a_user_target',
      { target: { type: 'user', id: UNKNOWN_ID }, reason: 'spam' },
      '/body/target/type',
    ],
    ['an_unknown_reason', onTrip(UNKNOWN_ID, { reason: 'boring' }), '/body/reason'],
    [
      'details_too_long',
      onTrip(UNKNOWN_ID, { details: 'x'.repeat(LIMITS.REPORT_DETAILS_MAX + 1) }),
      '/body/details',
    ],
    ['an_unknown_field', onTrip(UNKNOWN_ID, { status: 'actioned' }), '/body/status'],
  ])('rejects_%s_with_a_pointer', async (_case, body, pointer) => {
    const reporter = await createUser(t);

    const response = await report(reporter.agent, body);

    expect(response.status).toBe(422);
    expect(problemOf(response)).toMatchObject({
      code: 'validation_failed',
      errors: [expect.objectContaining({ pointer })],
    });
  });

  it('asks_anonymous_callers_to_sign_in', async () => {
    const response = await report(t.http, onTrip(UNKNOWN_ID));

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('unauthenticated');
  });

  it('throttles_a_reporter_after_ten_reports_an_hour', async () => {
    const [owner, reporter] = [await createUser(t), await createUser(t)];
    for (let index = 0; index < 10; index += 1) {
      const tripId = await tripOf(owner);
      expect((await report(reporter.agent, onTrip(tripId))).status).toBe(201);
    }

    const response = await report(reporter.agent, onTrip(await tripOf(owner)));

    expect(response.status).toBe(429);
    expect(problemOf(response).code).toBe('rate_limited');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});
