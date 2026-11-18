import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

// Database-level guarantees of the v1 model (SPEC V22). Rows are written with
// plain SQL so the database, not the Prisma client, is what gets tested.

const CHECK_CONSTRAINTS = [
  'days_position_chk',
  'places_lng_lat_chk',
  'places_source_shape_chk',
  'reports_target_chk',
  'reviews_body_len_chk',
  'reviews_hidden_chk',
  'reviews_rating_chk',
  'reviews_visited_on_chk',
  'stops_position_chk',
  'trips_destination_point_chk',
  'trips_plan_version_chk',
  'trips_published_chk',
  'trips_share_token_chk',
  'user_blocks_not_self_chk',
];

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const RESTRICT_VIOLATION = '23001';

let nextOsmId = 1;

describe('v1 model migration', () => {
  let database: TestDatabase;
  let db: pg.Client;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = new pg.Client({ connectionString: database.url });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
    await database.drop();
  });

  async function insertUser(): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO users (id, email, password_hash, display_name, updated_at)
       VALUES ($1, $2, 'hash', 'Test user', now())`,
      [id, `${id}@example.com`],
    );
    return id;
  }

  async function insertTrip(ownerId: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO trips (id, owner_id, title, updated_at) VALUES ($1, $2, 'Trip', now())`,
      [id, ownerId],
    );
    return id;
  }

  async function insertOsmPlace(): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO places (id, source, osm_type, osm_id, name, category, lng, lat, updated_at)
       VALUES ($1, 'osm', 'N', $2, 'Place', 'sight', -9.14, 38.71, now())`,
      [id, nextOsmId++],
    );
    return id;
  }

  async function insertCustomPlace(tripId: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO places (id, source, trip_id, name, category, lng, lat, updated_at)
       VALUES ($1, 'custom', $2, 'My pin', 'other', -9.14, 38.71, now())`,
      [id, tripId],
    );
    return id;
  }

  async function insertTripPlace(tripId: string, placeId: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO trip_places (id, trip_id, place_id, updated_at) VALUES ($1, $2, $3, now())`,
      [id, tripId, placeId],
    );
    return id;
  }

  async function insertDay(tripId: string, position = 0): Promise<string> {
    const id = randomUUID();
    await db.query(`INSERT INTO days (id, trip_id, position) VALUES ($1, $2, $3)`, [
      id,
      tripId,
      position,
    ]);
    return id;
  }

  async function insertStop(tripId: string, dayId: string, tripPlaceId: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO stops (id, trip_id, day_id, trip_place_id, position) VALUES ($1, $2, $3, $4, 0)`,
      [id, tripId, dayId, tripPlaceId],
    );
    return id;
  }

  async function insertReview(placeId: string, authorId: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO reviews (id, place_id, author_id, rating, body, visited_on, language, updated_at)
       VALUES ($1, $2, $3, 4, 'Worth the climb.', '2026-03-01', 'en', now())`,
      [id, placeId, authorId],
    );
    return id;
  }

  async function rowCount(table: string, column: string, value: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT count(*) FROM ${db.escapeIdentifier(table)} WHERE ${db.escapeIdentifier(column)} = $1`,
      [value],
    );
    return Number(result.rows[0]?.count);
  }

  it('creates_every_named_check_constraint', async () => {
    const result = await db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace
       ORDER BY conname`,
    );

    expect(result.rows.map((row) => row.conname)).toEqual(CHECK_CONSTRAINTS);
  });

  it('installs_the_unaccent_extension', async () => {
    const result = await db.query<{ folded: string }>(
      `SELECT unaccent('São Jorge à noite') AS folded`,
    );

    expect(result.rows[0]?.folded).toBe('Sao Jorge a noite');
  });

  const violations: Array<{ constraint: string; insert: (ids: Fixture) => Promise<unknown> }> = [
    {
      constraint: 'places_source_shape_chk',
      insert: ({ tripId }) =>
        db.query(
          `INSERT INTO places (source, osm_type, osm_id, trip_id, name, category, lng, lat, updated_at)
           VALUES ('osm', 'N', $1, $2, 'Osm place in a trip', 'sight', 0, 0, now())`,
          [nextOsmId++, tripId],
        ),
    },
    {
      constraint: 'places_source_shape_chk',
      insert: () =>
        db.query(
          `INSERT INTO places (source, name, category, lng, lat, updated_at)
           VALUES ('custom', 'Custom place without trip', 'other', 0, 0, now())`,
        ),
    },
    {
      constraint: 'places_lng_lat_chk',
      insert: ({ tripId }) =>
        db.query(
          `INSERT INTO places (source, trip_id, name, category, lng, lat, updated_at)
           VALUES ('custom', $1, 'Off the globe', 'other', 181, 0, now())`,
          [tripId],
        ),
    },
    {
      constraint: 'trips_destination_point_chk',
      insert: ({ userId }) =>
        db.query(
          `INSERT INTO trips (owner_id, title, destination_lng, updated_at) VALUES ($1, 'Half point', -9.1, now())`,
          [userId],
        ),
    },
    {
      constraint: 'trips_published_chk',
      insert: ({ userId }) =>
        db.query(
          `INSERT INTO trips (owner_id, title, visibility, share_token, updated_at)
           VALUES ($1, 'Public without date', 'public', $2, now())`,
          [userId, randomUUID().slice(0, 22)],
        ),
    },
    {
      constraint: 'trips_share_token_chk',
      insert: ({ userId }) =>
        db.query(
          `INSERT INTO trips (owner_id, title, visibility, updated_at) VALUES ($1, 'Link', 'link', now())`,
          [userId],
        ),
    },
    {
      constraint: 'trips_plan_version_chk',
      insert: ({ userId }) =>
        db.query(
          `INSERT INTO trips (owner_id, title, plan_version, updated_at) VALUES ($1, 'T', -1, now())`,
          [userId],
        ),
    },
    {
      constraint: 'days_position_chk',
      insert: ({ tripId }) =>
        db.query(`INSERT INTO days (trip_id, position) VALUES ($1, -1)`, [tripId]),
    },
    {
      constraint: 'stops_position_chk',
      insert: ({ tripId, dayId, tripPlaceId }) =>
        db.query(
          `INSERT INTO stops (trip_id, day_id, trip_place_id, position) VALUES ($1, $2, $3, -1)`,
          [tripId, dayId, tripPlaceId],
        ),
    },
    {
      constraint: 'reviews_rating_chk',
      insert: ({ placeId, userId }) =>
        db.query(
          `INSERT INTO reviews (place_id, author_id, rating, body, visited_on, language, updated_at)
           VALUES ($1, $2, 6, 'Too many stars here.', '2026-03-01', 'en', now())`,
          [placeId, userId],
        ),
    },
    {
      constraint: 'reviews_body_len_chk',
      insert: ({ placeId, userId }) =>
        db.query(
          `INSERT INTO reviews (place_id, author_id, rating, body, visited_on, language, updated_at)
           VALUES ($1, $2, 3, 'Too short', '2026-03-01', 'en', now())`,
          [placeId, userId],
        ),
    },
    {
      constraint: 'reviews_visited_on_chk',
      insert: ({ placeId, userId }) =>
        db.query(
          `INSERT INTO reviews (place_id, author_id, rating, body, visited_on, language, updated_at)
           VALUES ($1, $2, 3, 'Visited mid-month.', '2026-03-15', 'en', now())`,
          [placeId, userId],
        ),
    },
    {
      constraint: 'reviews_hidden_chk',
      insert: ({ placeId, userId }) =>
        db.query(
          `INSERT INTO reviews (place_id, author_id, rating, body, visited_on, language, status, updated_at)
           VALUES ($1, $2, 3, 'Hidden without a date.', '2026-03-01', 'en', 'hidden', now())`,
          [placeId, userId],
        ),
    },
    {
      constraint: 'reports_target_chk',
      insert: ({ userId, tripId }) =>
        db.query(
          `INSERT INTO reports (reporter_id, target_type, trip_id, reason) VALUES ($1, 'review', $2, 'spam')`,
          [userId, tripId],
        ),
    },
    {
      constraint: 'user_blocks_not_self_chk',
      insert: ({ userId }) =>
        db.query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $1)`, [userId]),
    },
  ];

  interface Fixture {
    userId: string;
    tripId: string;
    placeId: string;
    dayId: string;
    tripPlaceId: string;
  }

  async function insertFixture(): Promise<Fixture> {
    const userId = await insertUser();
    const tripId = await insertTrip(userId);
    const placeId = await insertOsmPlace();
    const dayId = await insertDay(tripId);
    const tripPlaceId = await insertTripPlace(tripId, placeId);
    return { userId, tripId, placeId, dayId, tripPlaceId };
  }

  it.each(violations)('rejects_a_row_that_breaks_$constraint', async ({ constraint, insert }) => {
    const fixture = await insertFixture();

    const failure = insert(fixture);

    await expect(failure).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint });
  });

  it('rejects_a_stop_whose_trip_place_belongs_to_another_trip', async () => {
    const userId = await insertUser();
    const tripId = await insertTrip(userId);
    const otherTripId = await insertTrip(userId);
    const dayId = await insertDay(tripId);
    const otherTripPlaceId = await insertTripPlace(otherTripId, await insertOsmPlace());

    const failure = insertStop(tripId, dayId, otherTripPlaceId);

    await expect(failure).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
      constraint: 'stops_trip_place_id_trip_id_fkey',
    });
  });

  it('deletes_a_trip_with_its_days_places_and_stops_in_one_statement', async () => {
    const userId = await insertUser();
    const tripId = await insertTrip(userId);
    const dayId = await insertDay(tripId);
    const customPlaceId = await insertCustomPlace(tripId);
    const customTripPlaceId = await insertTripPlace(tripId, customPlaceId);
    const osmPlaceId = await insertOsmPlace();
    const osmTripPlaceId = await insertTripPlace(tripId, osmPlaceId);
    await insertStop(tripId, dayId, customTripPlaceId);

    await db.query('DELETE FROM trips WHERE id = $1', [tripId]);

    expect({
      days: await rowCount('days', 'trip_id', tripId),
      tripPlaces: await rowCount('trip_places', 'trip_id', tripId),
      stops: await rowCount('stops', 'trip_id', tripId),
      customPlace: await rowCount('places', 'id', customPlaceId),
      osmPlace: await rowCount('places', 'id', osmPlaceId),
      osmTripPlace: await rowCount('trip_places', 'id', osmTripPlaceId),
    }).toEqual({ days: 0, tripPlaces: 0, stops: 0, customPlace: 0, osmPlace: 1, osmTripPlace: 0 });
  });

  it('refuses_to_delete_a_canonical_place_that_a_trip_uses', async () => {
    const tripId = await insertTrip(await insertUser());
    const placeId = await insertOsmPlace();
    await insertTripPlace(tripId, placeId);

    const failure = db.query('DELETE FROM places WHERE id = $1', [placeId]);

    await expect(failure).rejects.toMatchObject({
      code: RESTRICT_VIOLATION,
      constraint: 'trip_places_place_id_fkey',
    });
  });

  it('refuses_to_delete_a_canonical_place_that_has_reviews', async () => {
    const placeId = await insertOsmPlace();
    await insertReview(placeId, await insertUser());

    const failure = db.query('DELETE FROM places WHERE id = $1', [placeId]);

    await expect(failure).rejects.toMatchObject({
      code: RESTRICT_VIOLATION,
      constraint: 'reviews_place_id_fkey',
    });
  });
});
