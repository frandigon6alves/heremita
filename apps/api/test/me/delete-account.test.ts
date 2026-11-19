import { endpoints } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RatingSummaryReader } from '../../src/core/rating-summary.reader.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { createUser, FACTORY_PASSWORD } from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';
import { insertBlock, insertPlace, insertReview, insertTrip } from '../users/content.js';

const USER_COLUMNS = ['user_id', 'owner_id', 'author_id', 'blocker_id', 'blocked_id'];

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

/** Rows in any table whose user-referencing column still holds `userId`. */
async function rowsReferencing(userId: string): Promise<Record<string, number>> {
  const columns = await t.prisma.$queryRaw<{ table: string; column: string }[]>`
    SELECT table_name AS "table", column_name AS "column"
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = ANY(${USER_COLUMNS})`;
  const counts: Record<string, number> = {};
  for (const { table, column } of columns) {
    const [row] = await t.prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${table}" WHERE "${column}" = $1::uuid`,
      userId,
    );
    counts[`${table}.${column}`] = row?.count ?? 0;
  }
  return counts;
}

describe('E11 deleteAccount sweep (V13)', () => {
  it('leaves_no_row_referencing_the_user', async () => {
    const leaving = await createUser(t);
    const other = await createUser(t);
    const moderator = await createUser(t, { role: 'moderator' });
    const placeId = await insertPlace(t);
    const otherPlaceId = await insertPlace(t);

    const publicTrip = await insertTrip(t, leaving.user.id, {
      visibility: 'public',
      stops: [placeId],
      secondDayStops: [otherPlaceId],
      customPlace: true,
    });
    await insertTrip(t, leaving.user.id, { visibility: 'link', ideas: [placeId] });
    const review = await insertReview(t, leaving.user.id, placeId);
    await insertReview(t, leaving.user.id, otherPlaceId, { hidden: true });
    await insertBlock(t, leaving.user.id, other.user.id);
    await insertBlock(t, other.user.id, leaving.user.id);
    const copy = await insertTrip(t, other.user.id, {
      stops: [placeId],
      copiedFromTripId: publicTrip,
    });
    const otherReview = await insertReview(t, other.user.id, placeId);
    const filed = await t.prisma.report.create({
      data: {
        reporterId: leaving.user.id,
        targetType: 'review',
        reviewId: otherReview,
        reason: 'spam',
      },
    });
    await t.prisma.report.create({
      data: { reporterId: other.user.id, targetType: 'trip', tripId: publicTrip, reason: 'spam' },
    });
    await t.prisma.report.create({
      data: {
        reporterId: other.user.id,
        targetType: 'review',
        reviewId: review,
        reason: 'offensive',
        status: 'actioned',
        resolvedById: moderator.user.id,
        resolvedAt: t.clock.now(),
      },
    });
    const ratings = t.app.get(RatingSummaryReader);
    expect((await ratings.read([placeId], null)).get(placeId)?.count).toBe(2);

    await callOk(leaving.agent, 'deleteAccount', { body: { password: FACTORY_PASSWORD } });

    const referencing = await rowsReferencing(leaving.user.id);
    expect(referencing).toEqual({
      'sessions.user_id': 0,
      'trips.owner_id': 0,
      'reviews.author_id': 0,
      'user_blocks.blocker_id': 0,
      'user_blocks.blocked_id': 0,
    });
    expect(await t.prisma.report.count({ where: { reporterId: leaving.user.id } })).toBe(0);
    expect(await t.prisma.report.findUnique({ where: { id: filed.id } })).toMatchObject({
      reporterId: null,
      reviewId: otherReview,
    });
    expect(
      await t.prisma.report.count({
        where: { OR: [{ tripId: publicTrip }, { reviewId: review }] },
      }),
    ).toBe(0);
    expect(await t.prisma.trip.findUnique({ where: { id: copy } })).toMatchObject({
      ownerId: other.user.id,
      copiedFromTripId: null,
    });
    expect(await t.prisma.place.count({ where: { id: { in: [placeId, otherPlaceId] } } })).toBe(2);
    expect(await t.prisma.place.count({ where: { source: 'custom', tripId: publicTrip } })).toBe(0);
    expect((await ratings.read([placeId], null)).get(placeId)?.count).toBe(1);
    const profile = await sendRaw(other.agent, endpoints.getUserProfile, {
      params: { userId: leaving.user.id },
    });
    expect(profile.status).toBe(404);
  });
});
