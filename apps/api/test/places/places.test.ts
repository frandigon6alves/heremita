import {
  endpoints,
  problemDetailsSchema,
  type PlaceDetail,
  type PlaceResults,
} from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  PlaceResult,
  ProviderErrorKind,
  ReverseQuery,
  SearchQuery,
} from '../../src/providers/core/contract.js';
import { FakeGeocoder } from '../../src/providers/fake/fake-geocoder.js';
import { GAZETTEER, type GazetteerPlace } from '../../src/providers/fake/gazetteer.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { createUser, type TestUser } from '../support/factories.js';
import { sendRaw, type HttpClient } from '../support/http.js';
import { insertBlock, insertReview, insertTrip } from '../users/content.js';

const UNKNOWN_ID = '019a0000-0000-7000-8000-000000000000';

/** The fake geocoder, counting the calls that would reach a real provider. */
class CountingGeocoder extends FakeGeocoder {
  calls = 0;

  override search(query: SearchQuery): Promise<PlaceResult[]> {
    this.calls += 1;
    return super.search(query);
  }

  override reverse(query: ReverseQuery): Promise<PlaceResult[]> {
    this.calls += 1;
    return super.reverse(query);
  }
}

function gazetteerPlace(name: string): GazetteerPlace {
  const place = GAZETTEER.find((candidate) => candidate.localized['pt-BR'].name === name);
  if (!place) {
    throw new Error(`No gazetteer place named ${name}`);
  }
  return place;
}

const TOWER = gazetteerPlace('Torre de Belém');

let t: TestApp;
let geocoder: CountingGeocoder;
let users = 0;

beforeAll(async () => {
  geocoder = new CountingGeocoder();
  t = await buildTestApp({ geocoding: geocoder });
});

afterAll(async () => {
  await t.close();
});

function problemOf(response: { body: unknown }) {
  return problemDetailsSchema.parse(response.body);
}

function search(client: HttpClient, query: Record<string, unknown>) {
  return sendRaw(client, endpoints.searchPlaces, { query: { locale: 'pt-BR', ...query } });
}

function reverse(client: HttpClient, query: Record<string, unknown>) {
  return sendRaw(client, endpoints.reversePlaces, { query: { locale: 'pt-BR', ...query } });
}

function placePage(client: HttpClient, placeId: string) {
  return sendRaw(client, endpoints.getPlace, { params: { placeId } });
}

/** A user row written straight to the database (review authors need no session). */
async function insertUser(): Promise<string> {
  users += 1;
  const user = await t.prisma.user.create({
    data: { email: `author-${users}@example.com`, passwordHash: 'unused', displayName: 'Author' },
    select: { id: true },
  });
  return user.id;
}

/** The canonical row E29 would write for a gazetteer place. */
async function insertCanonical(place: GazetteerPlace): Promise<string> {
  const row = await t.prisma.place.upsert({
    where: { osmType_osmId: { osmType: place.ref.osmType, osmId: BigInt(place.ref.osmId) } },
    update: {},
    create: {
      source: 'osm',
      osmType: place.ref.osmType,
      osmId: BigInt(place.ref.osmId),
      name: place.localized['pt-BR'].name,
      label: place.localized['pt-BR'].label,
      category: place.category,
      osmKey: place.osmKey,
      osmValue: place.osmValue,
      lng: place.location.lng,
      lat: place.location.lat,
      countryCode: place.countryCode,
    },
    select: { id: true },
  });
  return row.id;
}

/** `count` published reviews of `rating` stars by fresh authors. */
async function insertReviews(placeId: string, ratings: readonly number[]): Promise<string[]> {
  const authors: string[] = [];
  for (const rating of ratings) {
    const authorId = await insertUser();
    await insertReview(t, authorId, placeId, { rating });
    authors.push(authorId);
  }
  return authors;
}

async function cachedPlaceKeys(): Promise<string[]> {
  const rows = await t.prisma.providerCache.findMany({
    where: { key: { startsWith: 'place:v1:' } },
    select: { key: true },
  });
  return rows.map((row) => row.key);
}

describe('GET /places/search (E42)', () => {
  it('answers_gazetteer_hits_with_private_caching', async () => {
    const response = await search((await createUser(t)).agent, { q: 'Torre de Bel' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, max-age=300');
    const { items } = response.body as PlaceResults;
    expect(items[0]).toMatchObject({
      key: TOWER.key,
      name: 'Torre de Belém',
      placeId: null,
      rating: null,
    });
    expect(items[0]).not.toHaveProperty('osmKey');
  });

  it('answers_names_in_the_requested_locale', async () => {
    const response = await search((await createUser(t)).agent, { q: 'Tower of Bel', locale: 'en' });

    expect((response.body as PlaceResults).items[0]?.name).toBe('Tower of Belém');
  });

  it('remembers_every_served_place_for_saving', async () => {
    const response = await search((await createUser(t)).agent, { q: 'Jerónimos' });

    const keys = (response.body as PlaceResults).items.map((item) => `place:v1:${item.key}`);
    expect(keys.length).toBeGreaterThan(0);
    expect(await cachedPlaceKeys()).toEqual(expect.arrayContaining(keys));
  });

  it('adds_place_id_and_rating_for_places_with_a_canonical_row', async () => {
    const place = gazetteerPlace('Padrão dos Descobrimentos');
    const placeId = await insertCanonical(place);
    await insertReviews(placeId, [5, 5, 4, 4, 3, 2]);
    await insertReview(t, await insertUser(), placeId, { rating: 1, hidden: true });

    const response = await search((await createUser(t)).agent, { q: 'Padrão dos Desc' });

    expect((response.body as PlaceResults).items[0]).toMatchObject({
      key: place.key,
      placeId,
      rating: { count: 6, average: 23 / 6, distribution: [0, 1, 1, 2, 2] },
    });
  });

  it('leaves_out_reviews_by_authors_the_viewer_blocked', async () => {
    const place = gazetteerPlace('Pastéis de Belém');
    const placeId = await insertCanonical(place);
    const authors = await insertReviews(placeId, [5, 5, 5, 5, 5, 1]);
    const viewer = await createUser(t);
    await insertBlock(t, viewer.user.id, authors[5] ?? '');

    const response = await search(viewer.agent, { q: 'Pastéis de Belém' });

    const hit = (response.body as PlaceResults).items.find((item) => item.key === place.key);
    expect(hit?.rating).toEqual({ count: 5, average: null, distribution: null });
  });

  it('browses_a_category_without_text', async () => {
    const response = await search((await createUser(t)).agent, {
      categories: 'culture',
      limit: 20,
    });

    expect(response.status).toBe(200);
    const { items } = response.body as PlaceResults;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.category === 'culture')).toBe(true);
  });

  it('caps_results_at_limit', async () => {
    const response = await search((await createUser(t)).agent, { categories: 'sight', limit: 2 });

    expect((response.body as PlaceResults).items).toHaveLength(2);
  });

  it('answers_an_empty_list_when_nothing_matches', async () => {
    const response = await search((await createUser(t)).agent, { q: 'zzzzzz', intent: 'submit' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it.each([
    [{ q: 'ab' }, '/query/q'],
    [{ q: 'museu', limit: 21 }, '/query/limit'],
    [{ q: 'museu', near: '200,10' }, '/query/near'],
    [{ q: 'museu', intent: 'browse' }, '/query/intent'],
    [{ q: 'museu', foo: 'bar' }, '/query/foo'],
  ])('rejects_%j_with_pointer_%s', async (query, pointer) => {
    const response = await search((await createUser(t)).agent, query);

    expect(response.status).toBe(422);
    const problem = problemOf(response);
    expect(problem.code).toBe('validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toContain(pointer);
  });

  it('answers_401_to_anonymous_callers_without_calling_the_geocoder', async () => {
    const before = geocoder.calls;

    const response = await search(t.http, { q: 'Torre de Belém' });

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('unauthenticated');
    expect(geocoder.calls).toBe(before);
  });
});

describe('GET /places/reverse (E43)', () => {
  it('answers_places_around_the_point_nearest_first', async () => {
    const response = await reverse((await createUser(t)).agent, {
      lng: TOWER.location.lng,
      lat: TOWER.location.lat,
    });

    expect(response.status).toBe(200);
    const { items } = response.body as PlaceResults;
    expect(items[0]?.key).toBe(TOWER.key);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(await cachedPlaceKeys()).toContain(`place:v1:${TOWER.key}`);
  });

  it('answers_an_empty_list_in_the_open_sea', async () => {
    const response = await reverse((await createUser(t)).agent, { lng: -30, lat: 35 });

    expect(response.body).toEqual({ items: [] });
  });

  it.each([
    [{ lng: -9.2, lat: 91 }, '/query/lat'],
    [{ lng: 'west', lat: 38.7 }, '/query/lng'],
    [{ lng: -9.2, lat: 38.7, locale: 'pt' }, '/query/locale'],
  ])('rejects_%j_with_pointer_%s', async (query, pointer) => {
    const response = await reverse((await createUser(t)).agent, query);

    expect(response.status).toBe(422);
    expect(problemOf(response).errors?.map((error) => error.pointer)).toContain(pointer);
  });

  it('answers_401_to_anonymous_callers_without_calling_the_geocoder', async () => {
    const before = geocoder.calls;

    const response = await reverse(t.http, { lng: -9.2, lat: 38.7 });

    expect(response.status).toBe(401);
    expect(geocoder.calls).toBe(before);
  });
});

describe('GET /places/{placeId} (E44)', () => {
  it('shows_an_osm_place_to_anonymous_viewers', async () => {
    const place = gazetteerPlace('Mosteiro dos Jerónimos');
    const placeId = await insertCanonical(place);

    const response = await placePage(t.http, placeId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      place: {
        id: placeId,
        source: 'osm',
        key: place.key,
        name: 'Mosteiro dos Jerónimos',
        label: place.localized['pt-BR'].label,
        category: place.category,
        location: place.location,
        countryCode: place.countryCode,
      },
      rating: { count: 0, average: null, distribution: null },
      inMyTrips: [],
      myReview: null,
    } satisfies PlaceDetail);
  });

  it('lists_only_the_viewers_trips_holding_the_place', async () => {
    const place = gazetteerPlace('LX Factory');
    const placeId = await insertCanonical(place);
    const viewer = await createUser(t);
    const stranger = await createUser(t);
    const tripId = await insertTrip(t, viewer.user.id, { title: 'Lisboa', ideas: [placeId] });
    await insertTrip(t, stranger.user.id, { title: 'Alheia', ideas: [placeId] });
    const tripPlace = await t.prisma.tripPlace.findFirstOrThrow({
      where: { tripId, placeId },
      select: { id: true },
    });

    const mine = await placePage(viewer.agent, placeId);
    const theirs = await placePage((await createUser(t)).agent, placeId);

    expect((mine.body as PlaceDetail).inMyTrips).toEqual([
      { tripId, tripTitle: 'Lisboa', tripPlaceId: tripPlace.id },
    ]);
    expect((theirs.body as PlaceDetail).inMyTrips).toEqual([]);
  });

  it('shows_the_viewer_their_own_review_even_when_hidden', async () => {
    const placeId = await insertCanonical(TOWER);
    const viewer = await createUser(t);
    const reviewId = await insertReview(t, viewer.user.id, placeId, { rating: 2, hidden: true });

    const response = await placePage(viewer.agent, placeId);

    const { myReview, rating } = response.body as PlaceDetail;
    expect(myReview).toMatchObject({
      id: reviewId,
      rating: 2,
      status: 'hidden',
      isMine: true,
      visitedMonth: '2026-09',
      language: 'pt-BR',
      place: { id: placeId, name: 'Torre de Belém' },
    });
    expect(rating.count).toBe(0);
  });

  it('answers_the_rating_summary_without_blocked_authors', async () => {
    const place = gazetteerPlace('Manteigaria "Fábrica de Pastéis de Nata"');
    const placeId = await insertCanonical(place);
    const authors = await insertReviews(placeId, [4, 4, 4, 4, 4, 4, 1]);
    const viewer = await createUser(t);
    await insertBlock(t, viewer.user.id, authors[6] ?? '');

    const anonymous = (await placePage(t.http, placeId)).body as PlaceDetail;
    const blocker = (await placePage(viewer.agent, placeId)).body as PlaceDetail;

    expect(anonymous.rating).toEqual({
      count: 7,
      average: 25 / 7,
      distribution: [1, 0, 0, 6, 0],
    });
    expect(blocker.rating).toEqual({ count: 6, average: 4, distribution: [0, 0, 0, 6, 0] });
  });

  it('answers_404_for_a_custom_place_even_to_its_owner', async () => {
    const owner = await createUser(t);
    const tripId = await insertTrip(t, owner.user.id, { customPlace: true });
    const custom = await t.prisma.place.findFirstOrThrow({
      where: { tripId, source: 'custom' },
      select: { id: true },
    });

    const response = await placePage(owner.agent, custom.id);

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('place_not_found');
  });

  it.each([UNKNOWN_ID, 'not-a-uuid'])('answers_404_place_not_found_for_%s', async (placeId) => {
    const response = await placePage((await createUser(t)).agent, placeId);

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('place_not_found');
  });
});

describe.each<[ProviderErrorKind, string, string | undefined]>([
  ['rate_limited', 'geocoding_busy', '1'],
  ['unavailable', 'geocoding_unavailable', undefined],
  ['timeout', 'geocoding_unavailable', undefined],
  ['bad_response', 'geocoding_unavailable', undefined],
])('geocoder failing with %s', (kind, code, retryAfter) => {
  let failing: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    failing = await buildTestApp({ geocoding: new FakeGeocoder({ failWith: kind }) });
    user = await createUser(failing);
  });

  afterAll(async () => {
    await failing.close();
  });

  it(`answers_503_${code}_and_caches_nothing`, async () => {
    const searched = await sendRaw(user.agent, endpoints.searchPlaces, {
      query: { q: 'Torre de Belém', locale: 'pt-BR' },
    });
    const reversed = await sendRaw(user.agent, endpoints.reversePlaces, {
      query: { lng: TOWER.location.lng, lat: TOWER.location.lat, locale: 'en' },
    });

    for (const response of [searched, reversed]) {
      expect(response.status).toBe(503);
      expect(problemOf(response).code).toBe(code);
      expect(response.headers['retry-after']).toBe(retryAfter);
    }
    expect(await failing.prisma.providerCache.count()).toBe(0);
  });
});
