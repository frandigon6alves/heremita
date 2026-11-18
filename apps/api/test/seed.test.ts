import { PrismaPg } from '@prisma/adapter-pg';
import { verify } from '@node-rs/argon2';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEMO_USER,
  LISBON_TRIP_ID,
  SeedRefusedError,
  seedDatabase,
} from '../prisma/seed-database.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const TABLES = ['users', 'places', 'trips', 'trip_places', 'days', 'stops', 'reviews', 'reports'];
const SEED_ENV = { NODE_ENV: 'test', DEMO_PASSWORD: 'seed-test-password' } as const;

interface Connection {
  database: TestDatabase;
  prisma: PrismaClient;
  sql: pg.Client;
}

async function connect(): Promise<Connection> {
  const database = await createTestDatabase();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.url }) });
  const sql = new pg.Client({ connectionString: database.url });
  await sql.connect();
  return { database, prisma, sql };
}

async function disconnect({ database, prisma, sql }: Connection): Promise<void> {
  await sql.end();
  await prisma.$disconnect();
  await database.drop();
}

/** Every seeded row of every table, as JSON, in a stable order. */
async function snapshot(sql: pg.Client): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const result = await sql.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) AS row FROM ${sql.escapeIdentifier(table)} t ORDER BY t::text`,
    );
    tables[table] = result.rows.map(({ row }) => row);
  }
  return tables;
}

async function count(sql: pg.Client, query: string): Promise<number> {
  const result = await sql.query<{ count: string }>(query);
  return Number(result.rows[0]?.count);
}

describe('seedDatabase', () => {
  let seeded: Connection;

  beforeAll(async () => {
    seeded = await connect();
    await seedDatabase(seeded.prisma, SEED_ENV);
  });

  afterAll(async () => {
    await disconnect(seeded);
  });

  it('leaves_every_row_unchanged_when_it_runs_again', async () => {
    const before = await snapshot(seeded.sql);

    await seedDatabase(seeded.prisma, SEED_ENV);

    expect(await snapshot(seeded.sql)).toEqual(before);
  });

  it('writes_the_same_rows_on_a_fresh_database', async () => {
    const fresh = await connect();
    try {
      await seedDatabase(fresh.prisma, SEED_ENV);

      const withoutHashes = (tables: Record<string, unknown[]>) => ({
        ...tables,
        users: tables.users?.map((user) => ({ ...(user as object), password_hash: null })),
      });
      expect(withoutHashes(await snapshot(fresh.sql))).toEqual(
        withoutHashes(await snapshot(seeded.sql)),
      );
    } finally {
      await disconnect(fresh);
    }
  });

  it('refuses_to_run_in_production', async () => {
    const empty = await connect();
    try {
      const run = seedDatabase(empty.prisma, { ...SEED_ENV, NODE_ENV: 'production' });

      await expect(run).rejects.toBeInstanceOf(SeedRefusedError);
      expect(await count(empty.sql, 'SELECT count(*) FROM users')).toBe(0);
    } finally {
      await disconnect(empty);
    }
  });

  it('lets_the_demo_user_log_in_with_the_demo_password', async () => {
    const user = await seeded.prisma.user.findUniqueOrThrow({ where: { email: DEMO_USER.email } });

    expect(await verify(user.passwordHash, SEED_ENV.DEMO_PASSWORD)).toBe(true);
  });

  it('marks_every_seeded_user_as_demo_with_one_moderator', async () => {
    const users = await seeded.prisma.user.findMany({ select: { isDemo: true, role: true } });

    expect(users).toHaveLength(6);
    expect(users.every((user) => user.isDemo)).toBe(true);
    expect(users.filter((user) => user.role === 'moderator')).toHaveLength(1);
  });

  it('seeds_seven_public_one_link_and_two_private_trips_of_the_demo_user', async () => {
    const trips = await seeded.prisma.trip.findMany({
      select: { visibility: true, ownerId: true },
    });

    expect(trips.filter((trip) => trip.visibility === 'public')).toHaveLength(7);
    expect(trips.filter((trip) => trip.visibility === 'link')).toHaveLength(1);
    expect(trips.filter((trip) => trip.visibility === 'private')).toEqual([
      { visibility: 'private', ownerId: DEMO_USER.id },
      { visibility: 'private', ownerId: DEMO_USER.id },
    ]);
  });

  it('gives_the_lisbon_trip_two_scheduled_days_four_ideas_and_notes', async () => {
    const trip = await seeded.prisma.trip.findUniqueOrThrow({
      where: { id: LISBON_TRIP_ID },
      include: {
        days: { include: { stops: true }, orderBy: { position: 'asc' } },
        tripPlaces: { include: { stops: true } },
      },
    });

    expect(trip.days.map((day) => day.stops.length > 0)).toEqual([true, true, false]);
    expect(trip.tripPlaces.filter((tripPlace) => tripPlace.stops.length === 0)).toHaveLength(4);
    expect(trip.tripPlaces.some((tripPlace) => tripPlace.note !== null)).toBe(true);
  });

  it('keeps_day_and_stop_positions_dense', async () => {
    const gaps = await count(
      seeded.sql,
      `SELECT count(*) FROM (
         SELECT trip_id FROM days GROUP BY trip_id HAVING max(position) <> count(*) - 1
         UNION ALL
         SELECT trip_id FROM stops GROUP BY day_id, trip_id HAVING max(position) <> count(*) - 1
       ) gaps`,
    );

    expect(gaps).toBe(0);
  });

  it('seeds_two_copied_trips_without_notes', async () => {
    const copies = await seeded.prisma.trip.findMany({
      where: { copiedFromTripId: { not: null } },
      include: { tripPlaces: { select: { note: true } } },
    });

    expect(copies).toHaveLength(2);
    expect(
      copies.flatMap((copy) => copy.tripPlaces).every((tripPlace) => tripPlace.note === null),
    ).toBe(true);
  });

  it('spreads_reviews_so_some_places_show_an_average_and_most_only_a_count', async () => {
    const perPlace = await seeded.prisma.review.groupBy({
      by: ['placeId'],
      _count: { _all: true },
    });
    const counts = perPlace.map((place) => place._count._all);

    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(90);
    expect(counts.filter((n) => n >= 6).length).toBeGreaterThanOrEqual(3);
    expect(counts.filter((n) => n < 6).length).toBeGreaterThan(counts.filter((n) => n >= 6).length);
    expect(await seeded.prisma.place.count()).toBeGreaterThan(perPlace.length);
  });

  it('fills_the_moderation_queue_with_two_open_reports_on_one_review_and_one_dismissed', async () => {
    const reports = await seeded.prisma.report.findMany({
      select: { status: true, reviewId: true },
    });
    const open = reports.filter((report) => report.status === 'open');

    expect(open).toHaveLength(2);
    expect(new Set(open.map((report) => report.reviewId)).size).toBe(1);
    expect(reports.filter((report) => report.status === 'dismissed')).toHaveLength(1);
  });
});
