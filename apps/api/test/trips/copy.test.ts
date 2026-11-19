import { endpoints, problemDetailsSchema, tripOwnerSchema, type TripOwner } from '@heremita/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';
import { createUser, publishTrip, type TestUser } from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';
import { PlanRows } from './plan-rows.js';

let t: TestApp;
let rows: PlanRows;

beforeAll(async () => {
  t = await buildTestApp();
  rows = new PlanRows(t);
});

afterAll(async () => {
  await t.close();
});

/** The plan of a trip as rows, ids replaced by what they point at, to compare a copy with its source. */
async function planShape(tripId: string) {
  const days = await t.prisma.day.findMany({
    where: { tripId },
    orderBy: { position: 'asc' },
    include: {
      stops: {
        orderBy: { position: 'asc' },
        include: { tripPlace: { include: { place: true } } },
      },
    },
  });
  return days.map((day) => ({
    position: day.position,
    modeOverride: day.modeOverride,
    stops: day.stops.map((stop) => ({
      position: stop.position,
      modeToNext: stop.modeToNext,
      place: stop.tripPlace.place.name,
    })),
  }));
}

interface SourceTrip {
  trip: TripOwner;
  canonicalPlaceId: string;
  customPlaceId: string;
}

/** 2 days: day 1 = canonical place → custom pin (bike between), day 2 (drive) = the pin again; one idea. */
async function sourceTrip(owner: TestUser, title = 'Lisboa em 3 dias'): Promise<SourceTrip> {
  const trip = await callOk(owner.agent, 'createTrip', {
    body: {
      title,
      startDate: '2027-05-01',
      dayCount: 2,
      destination: { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.14, lat: 38.71 } },
    },
  });
  await callOk(owner.agent, 'updateTrip', {
    params: { tripId: trip.id },
    body: { description: 'Trams and pastries' },
  });
  const [dayOne, dayTwo] = await rows.dayIds(trip.id);
  if (!dayOne || !dayTwo) {
    throw new Error('The source trip needs two days');
  }
  await t.prisma.day.update({ where: { id: dayTwo }, data: { modeOverride: 'drive' } });
  const tower = await rows.osmPlace(trip.id, -9.2, 38.69, 'Buy tickets online');
  const flat = await rows.customPlace(trip.id, 'Our flat', -9.14, 38.71);
  await rows.osmPlace(trip.id, -9.13, 38.72, 'Maybe');
  await rows.stop(trip.id, dayOne, tower.id, 0, 'bike');
  await rows.stop(trip.id, dayOne, flat.id, 1);
  await rows.stop(trip.id, dayTwo, flat.id, 0);
  return {
    trip: await callOk(owner.agent, 'getTrip', { params: { tripId: trip.id } }).then((value) =>
      tripOwnerSchema.parse(value),
    ),
    canonicalPlaceId: tower.placeId,
    customPlaceId: flat.placeId,
  };
}

function anonymous() {
  return request
    .agent(t.app.getHttpServer())
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', t.nextIp());
}

describe('E25 copyTrip', () => {
  it('duplicates_an_own_trip_as_a_private_undated_unshared_copy', async () => {
    const owner = await createUser(t);
    const source = await sourceTrip(owner);
    await publishTrip(owner.agent, source.trip.id, 'link');

    const response = await sendRaw(owner.agent, endpoints.copyTrip, {
      params: { tripId: source.trip.id },
      body: {},
    });

    expect(response.status).toBe(201);
    const copy = tripOwnerSchema.parse(response.body);
    expect(response.headers.location).toBe(`/api/v1/trips/${copy.id}`);
    expect(copy).toMatchObject({
      title: 'Cópia de Lisboa em 3 dias',
      description: 'Trams and pastries',
      destination: source.trip.destination,
      startDate: null,
      visibility: 'private',
      shareToken: null,
      dayCount: 2,
      placeCount: 3,
      defaultMode: source.trip.defaultMode,
      author: { id: owner.user.id },
    });
    const row = await t.prisma.trip.findUniqueOrThrow({ where: { id: copy.id } });
    expect(row).toMatchObject({
      copiedFromTripId: source.trip.id,
      publishedAt: null,
      planVersion: 0,
    });
  });

  it('keeps_days_stops_order_and_modes', async () => {
    const owner = await createUser(t);
    const source = await sourceTrip(owner);

    const copy = await callOk(owner.agent, 'copyTrip', {
      params: { tripId: source.trip.id },
      body: {},
    });

    expect(await planShape(copy.id)).toEqual(await planShape(source.trip.id));
  });

  it('leaves_every_note_behind', async () => {
    const owner = await createUser(t);
    const source = await sourceTrip(owner);

    const copy = await callOk(owner.agent, 'copyTrip', {
      params: { tripId: source.trip.id },
      body: {},
    });

    const notes = await t.prisma.tripPlace.findMany({
      where: { tripId: copy.id },
      select: { note: true },
    });
    expect(notes).toHaveLength(3);
    expect(notes.every((place) => place.note === null)).toBe(true);
  });

  it('shares_canonical_places_and_clones_custom_ones', async () => {
    const owner = await createUser(t);
    const source = await sourceTrip(owner);

    const copy = await callOk(owner.agent, 'copyTrip', {
      params: { tripId: source.trip.id },
      body: {},
    });
    const copied = await t.prisma.tripPlace.findMany({
      where: { tripId: copy.id },
      include: { place: true },
    });
    const custom = copied.find((tripPlace) => tripPlace.place.source === 'custom');
    await t.prisma.place.update({
      where: { id: custom?.placeId ?? '' },
      data: { name: 'Renamed in the copy' },
    });

    expect(copied.map((tripPlace) => tripPlace.placeId)).toContain(source.canonicalPlaceId);
    expect(custom?.place).toMatchObject({ tripId: copy.id, name: 'Our flat', lng: -9.14 });
    expect(custom?.placeId).not.toBe(source.customPlaceId);
    const original = await t.prisma.place.findUniqueOrThrow({
      where: { id: source.customPlaceId },
    });
    expect(original).toMatchObject({ tripId: source.trip.id, name: 'Our flat' });
  });

  it('titles_the_copy_in_the_copiers_language_unless_given_one', async () => {
    const [owner, english] = await Promise.all([createUser(t), createUser(t, { locale: 'en' })]);
    const source = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Rio' } })).id,
    );

    const localized = await callOk(english.agent, 'copyTrip', {
      params: { tripId: source.id },
      body: {},
    });
    const named = await callOk(english.agent, 'copyTrip', {
      params: { tripId: source.id },
      body: { title: '  My Rio  ' },
    });

    expect(localized.title).toBe('Copy of Rio');
    expect(named.title).toBe('My Rio');
  });

  it('copies_a_public_trip_of_someone_else_and_shows_where_it_came_from', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const source = await sourceTrip(owner, 'Public trip');
    await publishTrip(owner.agent, source.trip.id);

    const copy = await callOk(copier.agent, 'copyTrip', {
      params: { tripId: source.trip.id },
      body: {},
    });
    const sourceAfter = await callOk(copier.agent, 'getTrip', {
      params: { tripId: source.trip.id },
    });

    expect(copy.author.id).toBe(copier.user.id);
    expect(copy.copiedFrom).toEqual({ id: source.trip.id, title: 'Public trip' });
    expect(sourceAfter).toMatchObject({ viewerRole: 'viewer', copyCount: 1 });
  });

  it('hides_the_source_of_a_copy_once_it_is_no_longer_public', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const source = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Soon private' } })).id,
    );
    const copy = await callOk(copier.agent, 'copyTrip', {
      params: { tripId: source.id },
      body: {},
    });

    await publishTrip(owner.agent, source.id, 'link');
    const afterUnpublish = await callOk(copier.agent, 'getTrip', { params: { tripId: copy.id } });

    expect(copy.copiedFrom).not.toBeNull();
    expect(afterUnpublish.viewerRole === 'owner' && afterUnpublish.copiedFrom).toBeNull();
  });

  it('answers_404_for_trips_the_caller_cannot_read', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const privateTrip = await callOk(owner.agent, 'createTrip', { body: { title: 'Private' } });
    const linkTrip = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Link' } })).id,
      'link',
    );
    const hiddenTrip = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Hidden' } })).id,
    );
    await t.prisma.trip.update({
      where: { id: hiddenTrip.id },
      data: { moderationHiddenAt: t.clock.now() },
    });
    const before = await t.prisma.trip.count();

    const statuses = await Promise.all(
      [privateTrip.id, linkTrip.id, hiddenTrip.id, '0190d3a4-0000-7000-8000-000000000000'].map(
        async (tripId) =>
          (await sendRaw(stranger.agent, endpoints.copyTrip, { params: { tripId }, body: {} }))
            .status,
      ),
    );

    expect(statuses).toEqual([404, 404, 404, 404]);
    expect(await t.prisma.trip.count()).toBe(before);
  });

  it('rejects_an_invalid_title_and_unknown_keys', async () => {
    const owner = await createUser(t);
    const trip = await callOk(owner.agent, 'createTrip', { body: { title: 'Source' } });

    const blank = await sendRaw(owner.agent, endpoints.copyTrip, {
      params: { tripId: trip.id },
      body: { title: ' ' },
    });
    const unknown = await sendRaw(owner.agent, endpoints.copyTrip, {
      params: { tripId: trip.id },
      body: { notes: true },
    });

    expect(blank.status).toBe(422);
    expect(problemDetailsSchema.parse(blank.body).errors).toEqual([
      expect.objectContaining({ pointer: '/body/title' }),
    ]);
    expect(problemDetailsSchema.parse(unknown.body).errors).toEqual([
      expect.objectContaining({ pointer: '/body/notes' }),
    ]);
  });

  it('refuses_a_copy_beyond_the_copiers_trip_limit_and_writes_nothing', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const source = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Popular' } })).id,
    );
    await t.prisma.trip.createMany({
      data: Array.from({ length: 99 }, (_, index) => ({
        ownerId: copier.user.id,
        title: `Filler ${index}`,
      })),
    });

    const hundredth = await sendRaw(copier.agent, endpoints.copyTrip, {
      params: { tripId: source.id },
      body: {},
    });
    const next = await sendRaw(copier.agent, endpoints.copyTrip, {
      params: { tripId: source.id },
      body: {},
    });

    expect(hundredth.status).toBe(201);
    expect(next.status).toBe(409);
    expect(problemDetailsSchema.parse(next.body).code).toBe('limit_reached');
    expect(await t.prisma.trip.count({ where: { ownerId: copier.user.id } })).toBe(100);
  });

  it('requires_a_session', async () => {
    const owner = await createUser(t);
    const source = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Public' } })).id,
    );

    const response = await sendRaw(anonymous(), endpoints.copyTrip, {
      params: { tripId: source.id },
      body: {},
    });

    expect(response.status).toBe(401);
  });
});

describe('E28 copySharedTrip', () => {
  it('copies_a_link_trip_through_its_token', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const source = await sourceTrip(owner, 'Shared by link');
    const shared = await publishTrip(owner.agent, source.trip.id, 'link');

    const response = await sendRaw(copier.agent, endpoints.copySharedTrip, {
      params: { shareToken: shared.shareToken ?? '' },
      body: {},
    });

    expect(response.status).toBe(201);
    const copy = tripOwnerSchema.parse(response.body);
    expect(response.headers.location).toBe(`/api/v1/trips/${copy.id}`);
    expect(copy).toMatchObject({
      title: 'Cópia de Shared by link',
      visibility: 'private',
      copiedFrom: null,
    });
    expect(await planShape(copy.id)).toEqual(await planShape(source.trip.id));
  });

  it('lets_the_owner_copy_through_the_token_too', async () => {
    const owner = await createUser(t);
    const shared = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Mine' } })).id,
      'link',
    );

    const response = await sendRaw(owner.agent, endpoints.copySharedTrip, {
      params: { shareToken: shared.shareToken ?? '' },
      body: {},
    });

    expect(response.status).toBe(201);
  });

  it('answers_404_for_unknown_malformed_privatised_and_hidden_tokens', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const privatised = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Was shared' } })).id,
      'link',
    );
    await callOk(owner.agent, 'updateTrip', {
      params: { tripId: privatised.id },
      body: { visibility: 'private' },
    });
    const hidden = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Hidden' } })).id,
    );
    await t.prisma.trip.update({
      where: { id: hidden.id },
      data: { moderationHiddenAt: t.clock.now() },
    });

    const tokens = [
      'A'.repeat(22),
      'not a token',
      privatised.shareToken ?? '',
      hidden.shareToken ?? '',
    ];
    const responses = await Promise.all(
      tokens.map((shareToken) =>
        sendRaw(copier.agent, endpoints.copySharedTrip, { params: { shareToken }, body: {} }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(responses.map((response) => problemDetailsSchema.parse(response.body).code)).toEqual([
      'trip_not_found',
      'trip_not_found',
      'trip_not_found',
      'trip_not_found',
    ]);
    expect(await t.prisma.trip.count({ where: { ownerId: copier.user.id } })).toBe(0);
  });

  it('requires_a_session', async () => {
    const owner = await createUser(t);
    const shared = await publishTrip(
      owner.agent,
      (await callOk(owner.agent, 'createTrip', { body: { title: 'Link' } })).id,
      'link',
    );

    const response = await sendRaw(anonymous(), endpoints.copySharedTrip, {
      params: { shareToken: shared.shareToken ?? '' },
      body: {},
    });

    expect(response.status).toBe(401);
  });
});
