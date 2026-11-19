import {
  endpoints,
  pageSchema,
  problemDetailsSchema,
  publicTripCardSchema,
  type CreateTripBody,
} from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BARCELONA_TRIP_ID, SEED_USERS, seedDatabase } from '../../prisma/seed-database.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { keysOf, MINUTE_MS } from '../support/assertions.js';
import { createUser, publishTrip, type TestUser } from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';
import { PlanRows } from '../trips/plan-rows.js';

let t: TestApp;
let rows: PlanRows;
let marker = 0;

beforeAll(async () => {
  t = await buildTestApp();
  rows = new PlanRows(t);
});

afterAll(async () => {
  await t.close();
});

const VIEWER_FORBIDDEN_KEYS = [
  'note',
  'startDate',
  'date',
  'shareToken',
  'email',
  'createdAt',
  'updatedAt',
  'ownerId',
];

/** A word no other test's trips contain, so `q` scopes a test to its own trips. */
function uniqueWord(): string {
  marker += 1;
  return `zq${marker.toString(36)}x`;
}

async function publicTrip(user: TestUser, body: CreateTripBody) {
  const trip = await callOk(user.agent, 'createTrip', { body });
  return publishTrip(user.agent, trip.id);
}

const publicPageSchema = pageSchema(publicTripCardSchema);

/** A page of E48, which must answer 200. */
async function listPublic(query: Record<string, unknown>, client = t.http) {
  const response = await sendRaw(client, endpoints.listPublicTrips, { query });
  expect(response.status).toBe(200);
  return publicPageSchema.parse(response.body);
}

function problemOf(query: Record<string, unknown>) {
  return sendRaw(t.http, endpoints.listPublicTrips, { query }).then((response) => ({
    status: response.status,
    problem: problemDetailsSchema.parse(response.body),
  }));
}

describe('E48 listPublicTrips', () => {
  it('answers_an_empty_page_when_nothing_matches', async () => {
    const page = await listPublic({ q: uniqueWord() });

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('lists_only_public_unhidden_trips_newest_publication_first', async () => {
    const owner = await createUser(t);
    const word = uniqueWord();
    const older = await publicTrip(owner, { title: `${word} older` });
    t.clock.advance(MINUTE_MS);
    const newer = await publicTrip(owner, { title: `${word} newer` });
    await callOk(owner.agent, 'createTrip', { body: { title: `${word} private` } });
    await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: `${word} link` } })).id,
      'link',
    );
    const hidden = await publicTrip(owner, { title: `${word} hidden` });
    await t.prisma.trip.update({
      where: { id: hidden.id },
      data: { moderationHiddenAt: t.clock.now() },
    });

    const response = await listPublic({ q: word });

    expect(response.items.map((card) => card.id)).toEqual([newer.id, older.id]);
  });

  it('describes_each_trip_without_private_fields', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const word = uniqueWord();
    const trip = await publicTrip(owner, {
      title: `${word} Rio`,
      dayCount: 2,
      defaultMode: 'bike',
      startDate: '2027-01-01',
      destination: { name: 'Rio de Janeiro', countryCode: 'BR', center: null },
    });
    const [dayId] = await rows.dayIds(trip.id);
    const place = await rows.osmPlace(trip.id, -43.2, -22.9, 'secret note');
    await rows.stop(trip.id, dayId ?? '', place.id, 0);
    await callOk(copier.agent, 'copyTrip', { params: { tripId: trip.id }, body: {} });

    const response = await listPublic({ q: word });

    const [card] = response.items;
    expect(card).toEqual({
      id: trip.id,
      title: `${word} Rio`,
      destinationName: 'Rio de Janeiro',
      countryCode: 'BR',
      dayCount: 2,
      placeCount: 1,
      defaultMode: 'bike',
      copyCount: 1,
      author: { id: owner.user.id, displayName: owner.user.displayName, isDemo: false },
      previewPoints: [{ lng: -43.2, lat: -22.9 }],
      publishedAt: t.clock.now().toISOString(),
    });
    expect(keysOf(card).filter((key) => VIEWER_FORBIDDEN_KEYS.includes(key))).toEqual([]);
  });

  it('matches_title_or_destination_ignoring_accents_and_case', async () => {
    const owner = await createUser(t);
    const word = uniqueWord();
    const byTitle = await publicTrip(owner, { title: `São Paulo ${word}` });
    const byDestination = await publicTrip(owner, {
      title: `${word} weekend`,
      destination: { name: 'Sao Paulo', countryCode: 'BR', center: null },
    });
    await publicTrip(owner, { title: `${word} Lisboa` });

    const response = await listPublic({ q: `${word.toUpperCase()}` });
    const accented = await listPublic({ q: 'SÃO PAULO' });

    expect(response.items).toHaveLength(3);
    const ids = accented.items.map((card) => card.id);
    expect(ids).toEqual(expect.arrayContaining([byTitle.id, byDestination.id]));
  });

  it('treats_like_wildcards_in_q_as_plain_characters', async () => {
    const owner = await createUser(t);
    const word = uniqueWord();
    await publicTrip(owner, { title: `${word} plain` });

    const percent = await listPublic({ q: `${word}%plain` });
    const underscore = await listPublic({ q: `${word}_plain` });

    expect(percent.items).toEqual([]);
    expect(underscore.items).toEqual([]);
  });

  it('filters_by_destination_country_in_either_case', async () => {
    const owner = await createUser(t);
    const word = uniqueWord();
    const french = await publicTrip(owner, {
      title: `${word} Paris`,
      destination: { name: 'Paris', countryCode: 'FR', center: null },
    });
    await publicTrip(owner, {
      title: `${word} Lisboa`,
      destination: { name: 'Lisboa', countryCode: 'PT', center: null },
    });

    const response = await listPublic({ q: word, countryCode: 'fr' });

    expect(response.items.map((card) => card.id)).toEqual([french.id]);
  });

  it('leaves_out_authors_the_viewer_blocked', async () => {
    const [author, viewer] = await Promise.all([createUser(t), createUser(t)]);
    const word = uniqueWord();
    await publicTrip(author, { title: `${word} blocked author` });
    await t.prisma.userBlock.create({
      data: { blockerId: viewer.user.id, blockedId: author.user.id },
    });

    const forViewer = await listPublic({ q: word }, viewer.agent);
    const forAnonymous = await listPublic({ q: word });
    const forAuthor = await listPublic({ q: word }, author.agent);

    expect(forViewer.items).toEqual([]);
    expect(forAnonymous.items).toHaveLength(1);
    expect(forAuthor.items).toHaveLength(1);
  });

  it('pages_through_one_exactly_limit_and_limit_plus_one_trips', async () => {
    const owner = await createUser(t);
    const word = uniqueWord();
    await publicTrip(owner, { title: `${word} A` });

    const one = await listPublic({ q: word, limit: 2 });
    t.clock.advance(MINUTE_MS);
    await publicTrip(owner, { title: `${word} B` });
    const exactly = await listPublic({ q: word, limit: 2 });
    t.clock.advance(MINUTE_MS);
    await publicTrip(owner, { title: `${word} C` });
    const first = await listPublic({ q: word, limit: 2 });
    const second = await listPublic({ q: word, limit: 2, cursor: first.nextCursor });

    expect(one.items).toHaveLength(1);
    expect(one.nextCursor).toBeNull();
    expect(exactly.items).toHaveLength(2);
    expect(exactly.nextCursor).toBeNull();
    const titles = (page: typeof first) => page.items.map((card) => card.title);
    expect(titles(first)).toEqual([`${word} C`, `${word} B`]);
    expect(first.nextCursor).not.toBeNull();
    expect(titles(second)).toEqual([`${word} A`]);
    expect(second.nextCursor).toBeNull();
  });

  it('breaks_publication_time_ties_by_id', async () => {
    const owner = await createUser(t);
    const word = uniqueWord();
    const trips = [
      await publicTrip(owner, { title: `${word} 1` }),
      await publicTrip(owner, { title: `${word} 2` }),
      await publicTrip(owner, { title: `${word} 3` }),
    ];

    const first = await listPublic({ q: word, limit: 1 });
    const second = await listPublic({ q: word, limit: 1, cursor: first.nextCursor });
    const third = await listPublic({ q: word, limit: 1, cursor: second.nextCursor });

    const ids = [first, second, third].map((page) => page.items[0]?.id);
    expect(ids).toEqual(trips.map((trip) => trip.id).reverse());
    expect(third.nextCursor).toBeNull();
  });

  it('caps_preview_points_at_twenty', async () => {
    const owner = await createUser(t);
    const word = uniqueWord();
    const trip = await publicTrip(owner, { title: `${word} many places` });
    for (let index = 0; index < 21; index += 1) {
      await rows.osmPlace(trip.id, index, 1);
    }

    const response = await listPublic({ q: word });

    expect(response.items[0]?.previewPoints).toHaveLength(20);
  });

  it('rejects_bad_queries_with_pointers', async () => {
    const cases = [
      { query: { limit: 31 }, pointer: '/query/limit' },
      { query: { q: 'x'.repeat(81) }, pointer: '/query/q' },
      { query: { countryCode: 'BRA' }, pointer: '/query/countryCode' },
      { query: { sort: 'copied' }, pointer: '/query/sort' },
    ];

    for (const { query, pointer } of cases) {
      const { status, problem } = await problemOf(query);
      expect(status).toBe(422);
      expect(problem.errors).toEqual([expect.objectContaining({ pointer })]);
    }
  });

  it('rejects_a_tampered_cursor', async () => {
    const cursor = Buffer.from('["2026-01-01T00:00:00.000Z","nope"]').toString('base64url');

    const { status, problem } = await problemOf({ cursor });

    expect(status).toBe(422);
    expect(problem.code).toBe('invalid_cursor');
  });
});

describe('E48 listPublicTrips on the demo data', () => {
  it('lists_the_seeded_barcelona_trip', async () => {
    await seedDatabase(t.prisma, { NODE_ENV: 'test', DEMO_PASSWORD: 'seed-test-password' });

    const page = await listPublic({ q: 'barcelona' });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: BARCELONA_TRIP_ID,
        destinationName: 'Barcelona',
        countryCode: 'ES',
        dayCount: 2,
        placeCount: 8,
        author: { id: SEED_USERS.nuria.id, displayName: 'Núria Ferrer-Prueba', isDemo: true },
      }),
    ]);
  });
});
