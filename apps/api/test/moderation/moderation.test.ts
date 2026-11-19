import {
  endpoints,
  LIMITS,
  problemDetailsSchema,
  type Page,
  type ReportItem,
  type ReportStatus,
} from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';
import { createUser, type TestUser } from '../support/factories.js';
import { sendRaw, type HttpClient } from '../support/http.js';
import { insertPlace, insertReview, insertTrip } from '../users/content.js';

const UNKNOWN_ID = '019a0000-0000-7000-8000-000000000000';
const MINUTE_MS = 60_000;
const MAX_LIMIT: number = LIMITS.PAGE_SIZES.moderation.max;

let t: TestApp;
let moderator: TestUser;

beforeAll(async () => {
  t = await buildTestApp();
  moderator = await createUser(t, { role: 'moderator' });
});

afterAll(async () => {
  await t.close();
});

function problemOf(response: { body: unknown }) {
  return problemDetailsSchema.parse(response.body);
}

function nextMinute(): Date {
  t.clock.advance(MINUTE_MS);
  return t.clock.now();
}

async function queue(
  client: HttpClient,
  query: Record<string, unknown> = {},
): Promise<{ status: number; body: Page<ReportItem> }> {
  const response = await sendRaw(client, endpoints.listReports, { query });
  return { status: response.status, body: response.body as Page<ReportItem> };
}

/** Every page of the queue for one status, in order. */
async function wholeQueue(status: ReportStatus, limit = MAX_LIMIT): Promise<ReportItem[]> {
  const items: ReportItem[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await queue(moderator.agent, { status, limit, ...(cursor && { cursor }) });
    expect(page.status).toBe(200);
    items.push(...page.body.items);
    cursor = page.body.nextCursor;
  } while (cursor);
  return items;
}

function decide(client: HttpClient, reportId: string, decision: unknown) {
  return sendRaw(client, endpoints.decideReport, {
    params: { reportId },
    body: { decision },
  }).set('Origin', WEB_ORIGIN);
}

type Target = { reviewId: string } | { tripId: string };

async function insertReport(
  reporter: TestUser | null,
  target: Target,
  status: ReportStatus = 'open',
): Promise<string> {
  const row = await t.prisma.report.create({
    data: {
      reporterId: reporter?.user.id ?? null,
      targetType: 'reviewId' in target ? 'review' : 'trip',
      ...target,
      reason: 'offensive',
      details: 'Insults in the second line.',
      status,
      createdAt: nextMinute(),
    },
    select: { id: true },
  });
  return row.id;
}

async function reviewTarget(body?: string): Promise<{ author: TestUser; reviewId: string }> {
  const author = await createUser(t);
  const reviewId = await insertReview(t, author.user.id, await insertPlace(t), {
    createdAt: nextMinute(),
  });
  if (body !== undefined) {
    await t.prisma.review.update({ where: { id: reviewId }, data: { body } });
  }
  return { author, reviewId };
}

async function publicTrip(): Promise<string> {
  const owner = await createUser(t);
  return insertTrip(t, owner.user.id, { visibility: 'public', title: 'Porto a pé' });
}

describe('V10 access', () => {
  it('asks_anonymous_callers_to_sign_in', async () => {
    const list = await queue(t.http);
    const decision = await decide(t.http, UNKNOWN_ID, 'dismiss');

    expect([list.status, decision.status]).toEqual([401, 401]);
    expect(problemOf(decision).code).toBe('unauthenticated');
  });

  it('forbids_users_who_are_not_moderators', async () => {
    const user = await createUser(t);
    const reportId = await insertReport(user, { tripId: await publicTrip() });

    const list = await sendRaw(user.agent, endpoints.listReports);
    const decision = await decide(user.agent, reportId, 'hide_content');

    expect(list.status).toBe(403);
    expect(problemOf(list).code).toBe('forbidden');
    expect(decision.status).toBe(403);
    expect(problemOf(decision).code).toBe('forbidden');
    expect(await t.prisma.report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({
      status: 'open',
    });
  });

  it('never_grants_the_role_through_the_api', async () => {
    const user = await createUser(t);

    const response = await sendRaw(user.agent, endpoints.updateMe, {
      body: { role: 'moderator' },
    });

    expect(response.status).toBe(422);
    expect((await sendRaw(user.agent, endpoints.listReports)).status).toBe(403);
  });
});

describe('E50 listReports', () => {
  it('lists_open_reports_oldest_first_as_report_items', async () => {
    const reporter = await createUser(t);
    const { reviewId } = await reviewTarget();
    const tripId = await publicTrip();
    const first = await insertReport(reporter, { reviewId });
    const second = await insertReport(null, { tripId });

    const { createdAt } = await t.prisma.report.findUniqueOrThrow({ where: { id: first } });

    const items = await wholeQueue('open');

    const mine = items.filter((item) => [first, second].includes(item.id));
    expect(mine).toEqual([
      {
        id: first,
        target: { type: 'review', id: reviewId, excerpt: 'Vista linda ao fim da tarde.' },
        contentStatus: 'visible',
        reason: 'offensive',
        details: 'Insults in the second line.',
        status: 'open',
        reporter: { id: reporter.user.id, displayName: 'Test Traveller', isDemo: false },
        createdAt: createdAt.toISOString(),
        resolvedAt: null,
      },
      expect.objectContaining({
        id: second,
        target: { type: 'trip', id: tripId, excerpt: 'Porto a pé' },
        reporter: null,
      }),
    ]);
  });

  it('filters_by_status', async () => {
    const tripId = await publicTrip();
    const dismissed = await insertReport(null, { tripId }, 'dismissed');
    const open = await insertReport(null, { tripId });

    const dismissedIds = (await wholeQueue('dismissed')).map((item) => item.id);
    const openIds = (await wholeQueue('open')).map((item) => item.id);

    expect(dismissedIds).toContain(dismissed);
    expect(dismissedIds).not.toContain(open);
    expect(openIds).toContain(open);
    expect(openIds).not.toContain(dismissed);
  });

  it('pages_without_gaps_or_repeats', async () => {
    const tripId = await publicTrip();
    const created: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      created.push(await insertReport(null, { tripId }, 'actioned'));
    }

    const ids = (await wholeQueue('actioned', 2)).map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => created.includes(id))).toEqual(created);
  });

  it('cuts_long_excerpts_to_200_characters', async () => {
    const { reviewId } = await reviewTarget('ab'.repeat(150));
    const reportId = await insertReport(null, { reviewId });

    const item = (await wholeQueue('open')).find((row) => row.id === reportId);

    expect(item?.target.excerpt).toBe('ab'.repeat(100));
  });

  it.each([
    ['a_tampered_cursor', { cursor: 'bm9wZQ' }, 'invalid_cursor', '/query/cursor'],
    ['limit_above_the_maximum', { limit: MAX_LIMIT + 1 }, 'validation_failed', '/query/limit'],
    ['an_unknown_status', { status: 'closed' }, 'validation_failed', '/query/status'],
  ])('rejects_%s', async (_case, query, code, pointer) => {
    const response = await sendRaw(moderator.agent, endpoints.listReports, { query });

    expect(response.status).toBe(422);
    expect(problemOf(response)).toMatchObject({
      code,
      errors: [expect.objectContaining({ pointer })],
    });
  });
});

describe('E51 decideReport', () => {
  it('hides_a_review_and_actions_every_open_report_on_it', async () => {
    const { reviewId } = await reviewTarget();
    const [first, second] = [await createUser(t), await createUser(t)];
    const decided = await insertReport(first, { reviewId });
    const sibling = await insertReport(second, { reviewId });
    const earlierDismissed = await insertReport(null, { reviewId }, 'dismissed');
    const otherTarget = await insertReport(first, { tripId: await publicTrip() });
    const before = await t.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
    const decidedAt = nextMinute();

    const response = await decide(moderator.agent, decided, 'hide_content');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: decided,
      status: 'actioned',
      contentStatus: 'hidden',
      resolvedAt: decidedAt.toISOString(),
    });
    const review = await t.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
    expect(review).toMatchObject({ status: 'hidden', hiddenAt: decidedAt });
    expect(review.updatedAt).toEqual(before.updatedAt);
    const reports = await t.prisma.report.findMany({
      where: { id: { in: [decided, sibling, earlierDismissed, otherTarget] } },
      select: { id: true, status: true, resolvedById: true },
    });
    expect(Object.fromEntries(reports.map((row) => [row.id, row.status]))).toEqual({
      [decided]: 'actioned',
      [sibling]: 'actioned',
      [earlierDismissed]: 'dismissed',
      [otherTarget]: 'open',
    });
    expect(reports.find((row) => row.id === sibling)?.resolvedById).toBe(moderator.user.id);
  });

  it('makes_a_hidden_review_invisible_to_all_but_its_author (V8)', async () => {
    const author = await createUser(t);
    const placeId = await insertPlace(t);
    const reviewId = await insertReview(t, author.user.id, placeId);
    const reportId = await insertReport(null, { reviewId });

    await decide(moderator.agent, reportId, 'hide_content');

    const list = (client: HttpClient) =>
      sendRaw(client, endpoints.listPlaceReviews, { params: { placeId } });
    expect((await list(t.http)).body).toMatchObject({ items: [] });
    expect((await list(author.agent)).body).toMatchObject({
      items: [{ id: reviewId, status: 'hidden' }],
    });
  });

  it('hides_a_trip_from_everyone_but_its_owner (V8)', async () => {
    const owner = await createUser(t);
    const tripId = await insertTrip(t, owner.user.id, { visibility: 'public' });
    const before = await t.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    const reportId = await insertReport(null, { tripId });

    const response = await decide(moderator.agent, reportId, 'hide_content');

    expect(response.body).toMatchObject({ contentStatus: 'hidden', status: 'actioned' });
    const trip = await t.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(trip.moderationHiddenAt).toEqual(t.clock.now());
    expect(trip.updatedAt).toEqual(before.updatedAt);
    const read = (client: HttpClient) => sendRaw(client, endpoints.getTrip, { params: { tripId } });
    expect((await read(t.http)).status).toBe(404);
    expect((await read(owner.agent)).status).toBe(200);
  });

  it('restores_hidden_content', async () => {
    const { reviewId } = await reviewTarget();
    const tripId = await publicTrip();
    const onReview = await insertReport(null, { reviewId });
    const onTrip = await insertReport(null, { tripId });
    await decide(moderator.agent, onReview, 'hide_content');
    await decide(moderator.agent, onTrip, 'hide_content');

    const review = await decide(moderator.agent, onReview, 'restore_content');
    const trip = await decide(moderator.agent, onTrip, 'restore_content');

    expect(review.body).toMatchObject({ status: 'actioned', contentStatus: 'visible' });
    expect(trip.body).toMatchObject({ status: 'actioned', contentStatus: 'visible' });
    expect(await t.prisma.review.findUniqueOrThrow({ where: { id: reviewId } })).toMatchObject({
      status: 'published',
      hiddenAt: null,
    });
    expect(await t.prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({
      moderationHiddenAt: null,
    });
  });

  it('dismisses_every_open_report_on_the_target_and_leaves_the_content', async () => {
    const tripId = await publicTrip();
    const decided = await insertReport(null, { tripId });
    const sibling = await insertReport(null, { tripId });

    const response = await decide(moderator.agent, decided, 'dismiss');

    expect(response.body).toMatchObject({ status: 'dismissed', contentStatus: 'visible' });
    expect(await t.prisma.report.findUniqueOrThrow({ where: { id: sibling } })).toMatchObject({
      status: 'dismissed',
      resolvedById: moderator.user.id,
    });
    expect(await t.prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({
      moderationHiddenAt: null,
    });
  });

  it.each([
    ['an_unknown_report', UNKNOWN_ID],
    ['a_malformed_id', 'nope'],
  ])('answers_not_found_for_%s', async (_case, reportId) => {
    const response = await decide(moderator.agent, reportId, 'dismiss');

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('not_found');
  });

  it('rejects_an_unknown_decision_with_a_pointer', async () => {
    const reportId = await insertReport(null, { tripId: await publicTrip() });

    const response = await decide(moderator.agent, reportId, 'delete');

    expect(response.status).toBe(422);
    expect(problemOf(response)).toMatchObject({
      code: 'validation_failed',
      errors: [expect.objectContaining({ pointer: '/body/decision' })],
    });
  });
});
