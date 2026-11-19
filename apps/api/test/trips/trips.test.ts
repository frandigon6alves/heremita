import {
  endpoints,
  myTripCardSchema,
  problemDetailsSchema,
  tripOwnerSchema,
  tripPublicSchema,
  type TripOwner,
} from '@heremita/shared';
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

const MINUTE_MS = 60_000;
const UNKNOWN_ID = '0190d3a4-0000-7000-8000-000000000000';
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

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysOf);
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
  }
  return [];
}

function newTrip(user: TestUser, body: { title?: string; dayCount?: number } = {}) {
  return callOk(user.agent, 'createTrip', { body: { title: 'Lisboa', ...body } });
}

/** A client without a session that passes the CSRF check, so a missing session answers 401. */
function anonymous() {
  return request
    .agent(t.app.getHttpServer())
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', t.nextIp());
}

/** Inserts trips owned by `userId` directly, to reach the per-user limit quickly. */
async function fillTrips(userId: string, count: number): Promise<void> {
  await t.prisma.trip.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      ownerId: userId,
      title: `Filler ${index}`,
    })),
  });
}

async function planVersionOf(tripId: string): Promise<number> {
  const trip = await t.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  return trip.planVersion;
}

describe('E18 listMyTrips', () => {
  it('answers_an_empty_page_for_a_user_without_trips', async () => {
    const user = await createUser(t);

    const page = await callOk(user.agent, 'listMyTrips', { query: {} });

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('lists_only_the_callers_trips_most_recently_edited_first', async () => {
    const [user, other] = await Promise.all([createUser(t), createUser(t)]);
    const first = await newTrip(user, { title: 'First' });
    t.clock.advance(MINUTE_MS);
    const second = await newTrip(user, { title: 'Second' });
    await newTrip(other, { title: 'Not mine' });
    t.clock.advance(MINUTE_MS);
    await callOk(user.agent, 'updateTrip', {
      params: { tripId: first.id },
      body: { title: 'First, edited' },
    });

    const page = await callOk(user.agent, 'listMyTrips', { query: {} });

    expect(page.items.map((card) => card.title)).toEqual(['First, edited', 'Second']);
    expect(page.items.map((card) => card.id)).toEqual([first.id, second.id]);
    expect(page.items.every((card) => myTripCardSchema.safeParse(card).success)).toBe(true);
  });

  it('pages_through_one_exactly_limit_and_limit_plus_one_trips', async () => {
    const user = await createUser(t);
    await newTrip(user, { title: 'A' });

    const one = await callOk(user.agent, 'listMyTrips', { query: { limit: 2 } });
    await newTrip(user, { title: 'B' });
    const exactly = await callOk(user.agent, 'listMyTrips', { query: { limit: 2 } });
    await newTrip(user, { title: 'C' });
    const firstPage = await callOk(user.agent, 'listMyTrips', { query: { limit: 2 } });
    const secondPage = await callOk(user.agent, 'listMyTrips', {
      query: { limit: 2, cursor: firstPage.nextCursor ?? undefined },
    });

    expect(one.items).toHaveLength(1);
    expect(one.nextCursor).toBeNull();
    expect(exactly.items).toHaveLength(2);
    expect(exactly.nextCursor).toBeNull();
    expect(firstPage.items.map((card) => card.title)).toEqual(['C', 'B']);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(secondPage.items.map((card) => card.title)).toEqual(['A']);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('rejects_a_tampered_cursor', async () => {
    const user = await createUser(t);

    const response = await sendRaw(user.agent, endpoints.listMyTrips, {
      query: { cursor: Buffer.from('["yesterday","x"]').toString('base64url') },
    });

    expect(response.status).toBe(422);
    expect(problemDetailsSchema.parse(response.body).code).toBe('invalid_cursor');
  });

  it('rejects_a_limit_above_the_maximum', async () => {
    const user = await createUser(t);

    const response = await sendRaw(user.agent, endpoints.listMyTrips, { query: { limit: 51 } });

    expect(response.status).toBe(422);
    expect(problemDetailsSchema.parse(response.body).errors).toEqual([
      expect.objectContaining({ pointer: '/query/limit' }),
    ]);
  });

  it('previews_stops_in_visit_order_then_ideas', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user, { dayCount: 2 });
    const [dayOne, dayTwo] = await rows.dayIds(trip.id);
    await rows.osmPlace(trip.id, 1, 1);
    const late = await rows.osmPlace(trip.id, 3, 3);
    const early = await rows.osmPlace(trip.id, 2, 2);
    await rows.stop(trip.id, dayTwo ?? '', late.id, 0);
    await rows.stop(trip.id, dayOne ?? '', early.id, 0);

    const page = await callOk(user.agent, 'listMyTrips', { query: {} });

    expect(page.items[0]?.previewPoints).toEqual([
      { lng: 2, lat: 2 },
      { lng: 3, lat: 3 },
      { lng: 1, lat: 1 },
    ]);
  });

  it('caps_preview_points_at_twenty', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);
    for (let index = 0; index < 21; index += 1) {
      await rows.osmPlace(trip.id, index, 0);
    }

    const page = await callOk(user.agent, 'listMyTrips', { query: {} });

    expect(page.items[0]?.previewPoints).toHaveLength(20);
    expect(page.items[0]?.placeCount).toBe(21);
  });

  it('requires_a_session', async () => {
    const response = await sendRaw(anonymous(), endpoints.listMyTrips);

    expect(response.status).toBe(401);
  });
});

describe('E19 createTrip', () => {
  it('creates_a_private_trip_with_its_days', async () => {
    const user = await createUser(t);

    const response = await sendRaw(user.agent, endpoints.createTrip, {
      body: {
        title: '  Rio  ',
        destination: {
          name: 'Rio de Janeiro',
          countryCode: 'BR',
          center: { lng: -43.2, lat: -22.9 },
        },
        startDate: '2027-01-10',
        dayCount: 3,
        defaultMode: 'bike',
      },
    });

    expect(response.status).toBe(201);
    const trip = tripOwnerSchema.parse(response.body);
    expect(response.headers.location).toBe(`/api/v1/trips/${trip.id}`);
    expect(trip).toMatchObject({
      viewerRole: 'owner',
      title: 'Rio',
      description: null,
      destination: {
        name: 'Rio de Janeiro',
        countryCode: 'BR',
        center: { lng: -43.2, lat: -22.9 },
      },
      startDate: '2027-01-10',
      dayCount: 3,
      placeCount: 0,
      defaultMode: 'bike',
      visibility: 'private',
      shareToken: null,
      author: { id: user.user.id, displayName: user.user.displayName, isDemo: false },
      copiedFrom: null,
      createdAt: t.clock.now().toISOString(),
    });
    const days = await t.prisma.day.findMany({ where: { tripId: trip.id } });
    expect(days.map((day) => day.position).sort()).toEqual([0, 1, 2]);
  });

  it('applies_the_defaults', async () => {
    const user = await createUser(t);

    const trip = await callOk(user.agent, 'createTrip', { body: { title: 'Paris' } });

    expect(trip).toMatchObject({
      destination: null,
      startDate: null,
      dayCount: 1,
      defaultMode: 'walk',
    });
  });

  it('creates_a_trip_without_days', async () => {
    const user = await createUser(t);

    const trip = await newTrip(user, { dayCount: 0 });

    expect(trip.dayCount).toBe(0);
  });

  it('rejects_a_blank_title_and_unknown_keys_with_pointers', async () => {
    const user = await createUser(t);

    const response = await sendRaw(user.agent, endpoints.createTrip, {
      body: { title: '   ', ownerId: UNKNOWN_ID },
    });

    expect(response.status).toBe(422);
    const pointers = problemDetailsSchema.parse(response.body).errors?.map((e) => e.pointer);
    expect(pointers).toEqual(expect.arrayContaining(['/body/title', '/body/ownerId']));
  });

  it('rejects_more_days_than_a_trip_holds', async () => {
    const user = await createUser(t);

    const response = await sendRaw(user.agent, endpoints.createTrip, {
      body: { title: 'Long', dayCount: 61 },
    });

    expect(response.status).toBe(422);
    expect(problemDetailsSchema.parse(response.body).errors).toEqual([
      expect.objectContaining({ pointer: '/body/dayCount' }),
    ]);
  });

  it('allows_the_hundredth_trip_and_refuses_the_hundred_and_first', async () => {
    const user = await createUser(t);
    await fillTrips(user.user.id, 99);

    const hundredth = await sendRaw(user.agent, endpoints.createTrip, { body: { title: '100' } });
    const next = await sendRaw(user.agent, endpoints.createTrip, { body: { title: '101' } });

    expect(hundredth.status).toBe(201);
    expect(next.status).toBe(409);
    expect(problemDetailsSchema.parse(next.body).code).toBe('limit_reached');
    expect(await t.prisma.trip.count({ where: { ownerId: user.user.id } })).toBe(100);
  });

  it('never_passes_the_limit_under_concurrent_creates', async () => {
    const user = await createUser(t);
    await fillTrips(user.user.id, 98);

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        sendRaw(user.agent, endpoints.createTrip, { body: { title: `Race ${index}` } }),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409]);
    expect(await t.prisma.trip.count({ where: { ownerId: user.user.id } })).toBe(100);
  });

  it('requires_a_session', async () => {
    const response = await sendRaw(anonymous(), endpoints.createTrip, {
      body: { title: 'Nope' },
    });

    expect(response.status).toBe(401);
  });
});

describe('E20 getTrip', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let privateTrip: TripOwner;
  let publicTrip: TripOwner;
  let linkTrip: TripOwner;

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    privateTrip = await newTrip(owner, { title: 'Private' });
    publicTrip = await publishTrip(owner.agent, (await newTrip(owner, { title: 'Public' })).id);
    linkTrip = await publishTrip(owner.agent, (await newTrip(owner, { title: 'Link' })).id, 'link');
  });

  it('gives_the_owner_the_owner_shape', async () => {
    const trip = await callOk(owner.agent, 'getTrip', { params: { tripId: privateTrip.id } });

    expect(trip).toEqual(privateTrip);
  });

  it('gives_others_the_viewer_shape_of_a_public_trip_without_private_keys', async () => {
    const forAnonymous = await callOk(t.http, 'getTrip', { params: { tripId: publicTrip.id } });
    const forStranger = await callOk(stranger.agent, 'getTrip', {
      params: { tripId: publicTrip.id },
    });

    for (const trip of [forAnonymous, forStranger]) {
      expect(tripPublicSchema.parse(trip)).toMatchObject({
        viewerRole: 'viewer',
        title: 'Public',
        visibility: 'public',
        copyCount: 0,
      });
      expect(keysOf(trip).filter((key) => VIEWER_FORBIDDEN_KEYS.includes(key))).toEqual([]);
    }
  });

  it('hides_private_and_link_trips_from_others', async () => {
    for (const tripId of [privateTrip.id, linkTrip.id]) {
      for (const client of [t.http, stranger.agent]) {
        const response = await sendRaw(client, endpoints.getTrip, { params: { tripId } });
        expect(response.status).toBe(404);
        expect(problemDetailsSchema.parse(response.body).code).toBe('trip_not_found');
      }
    }
  });

  it('hides_a_moderated_trip_from_everyone_but_its_owner', async () => {
    const hidden = await publishTrip(owner.agent, (await newTrip(owner)).id);
    await t.prisma.trip.update({
      where: { id: hidden.id },
      data: { moderationHiddenAt: t.clock.now() },
    });

    const forStranger = await sendRaw(stranger.agent, endpoints.getTrip, {
      params: { tripId: hidden.id },
    });
    const forOwner = await callOk(owner.agent, 'getTrip', { params: { tripId: hidden.id } });

    expect(forStranger.status).toBe(404);
    expect(forOwner.viewerRole).toBe('owner');
  });

  it('answers_404_for_unknown_and_malformed_ids', async () => {
    const unknown = await sendRaw(owner.agent, endpoints.getTrip, {
      params: { tripId: UNKNOWN_ID },
    });
    const malformed = await sendRaw(owner.agent, endpoints.getTrip, {
      params: { tripId: 'not-a-uuid' },
    });

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(problemDetailsSchema.parse(malformed.body).code).toBe('trip_not_found');
  });
});

describe('E21 updateTrip', () => {
  it('edits_fields_and_moves_updated_at', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);
    t.clock.advance(MINUTE_MS);

    const updated = await callOk(user.agent, 'updateTrip', {
      params: { tripId: trip.id },
      body: {
        title: 'Lisboa e Sintra',
        description: 'Three days,\n\n\n\n\ntwo towns',
        destination: { name: 'Lisboa', countryCode: 'PT', center: null },
        startDate: '2027-03-01',
      },
    });

    expect(updated).toMatchObject({
      title: 'Lisboa e Sintra',
      description: 'Three days,\n\n\ntwo towns',
      destination: { name: 'Lisboa', countryCode: 'PT', center: null },
      startDate: '2027-03-01',
      createdAt: trip.createdAt,
      updatedAt: t.clock.now().toISOString(),
    });
  });

  it('clears_nullable_fields', async () => {
    const user = await createUser(t);
    const trip = await callOk(user.agent, 'createTrip', {
      body: {
        title: 'Paris',
        startDate: '2027-01-01',
        destination: { name: 'Paris', countryCode: 'FR', center: { lng: 2.35, lat: 48.85 } },
      },
    });

    const updated = await callOk(user.agent, 'updateTrip', {
      params: { tripId: trip.id },
      body: { destination: null, startDate: null, description: null },
    });

    expect(updated).toMatchObject({ destination: null, startDate: null, description: null });
  });

  it('creates_the_share_token_when_leaving_private_and_keeps_it_afterwards', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);

    const link = await publishTrip(user.agent, trip.id, 'link');
    const published = await publishTrip(user.agent, trip.id, 'public');
    const privateAgain = await callOk(user.agent, 'updateTrip', {
      params: { tripId: trip.id },
      body: { visibility: 'private' },
    });
    const linkAgain = await publishTrip(user.agent, trip.id, 'link');

    expect(link.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(published.shareToken).toBe(link.shareToken);
    expect(privateAgain.shareToken).toBe(link.shareToken);
    expect(linkAgain.shareToken).toBe(link.shareToken);
  });

  it('stamps_published_at_on_becoming_public_and_clears_it_on_leaving', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);
    const publishedAt = t.clock.now();

    await publishTrip(user.agent, trip.id, 'public');
    t.clock.advance(MINUTE_MS);
    await publishTrip(user.agent, trip.id, 'public');
    const whilePublic = await t.prisma.trip.findUniqueOrThrow({ where: { id: trip.id } });
    await publishTrip(user.agent, trip.id, 'link');
    const afterLeaving = await t.prisma.trip.findUniqueOrThrow({ where: { id: trip.id } });

    expect(whilePublic.publishedAt).toEqual(publishedAt);
    expect(afterLeaving.publishedAt).toBeNull();
  });

  it('bumps_the_plan_version_only_when_the_default_mode_changes', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);
    const tripId = trip.id;
    const start = await planVersionOf(tripId);

    await callOk(user.agent, 'updateTrip', { params: { tripId }, body: { defaultMode: 'walk' } });
    const sameMode = await planVersionOf(tripId);
    await callOk(user.agent, 'updateTrip', { params: { tripId }, body: { defaultMode: 'drive' } });
    const newMode = await planVersionOf(tripId);
    await callOk(user.agent, 'updateTrip', {
      params: { tripId },
      body: {
        title: 'Renamed',
        description: 'Text',
        visibility: 'public',
        startDate: '2027-02-02',
      },
    });
    const otherFields = await planVersionOf(tripId);

    expect(sameMode).toBe(start);
    expect(newMode).toBe(start + 1);
    expect(otherFields).toBe(newMode);
  });

  it('rejects_an_empty_body_and_server_owned_fields', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);

    const empty = await sendRaw(user.agent, endpoints.updateTrip, {
      params: { tripId: trip.id },
      body: {},
    });
    const forged = await sendRaw(user.agent, endpoints.updateTrip, {
      params: { tripId: trip.id },
      body: { shareToken: 'x'.repeat(22) },
    });

    expect(empty.status).toBe(422);
    expect(forged.status).toBe(422);
    expect(problemDetailsSchema.parse(forged.body).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ pointer: '/body/shareToken' })]),
    );
  });

  it('answers_404_to_a_non_owner_and_changes_nothing', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const trip = await publishTrip(owner.agent, (await newTrip(owner)).id);
    const before = await t.prisma.trip.findUniqueOrThrow({ where: { id: trip.id } });

    const response = await sendRaw(stranger.agent, endpoints.updateTrip, {
      params: { tripId: trip.id },
      body: { title: 'Mine now', visibility: 'private' },
    });

    expect(response.status).toBe(404);
    expect(problemDetailsSchema.parse(response.body).code).toBe('trip_not_found');
    expect(await t.prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).toEqual(before);
  });
});

describe('owner-only trip endpoints', () => {
  it('require_a_session', async () => {
    const tripId = UNKNOWN_ID;

    const update = await sendRaw(anonymous(), endpoints.updateTrip, {
      params: { tripId },
      body: { title: 'Nope' },
    });
    const remove = await sendRaw(anonymous(), endpoints.deleteTrip, { params: { tripId } });

    expect(update.status).toBe(401);
    expect(remove.status).toBe(401);
  });
});

describe('E22 deleteTrip', () => {
  it('deletes_the_trip_with_its_plan_and_custom_places', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);
    const [dayId] = await rows.dayIds(trip.id);
    const pin = await rows.customPlace(trip.id, 'Flat', -9.1, 38.7);
    await rows.stop(trip.id, dayId ?? '', pin.id, 0);

    const response = await sendRaw(user.agent, endpoints.deleteTrip, {
      params: { tripId: trip.id },
    });
    const again = await sendRaw(user.agent, endpoints.getTrip, { params: { tripId: trip.id } });

    expect(response.status).toBe(204);
    expect(again.status).toBe(404);
    expect(await t.prisma.place.count({ where: { id: pin.placeId } })).toBe(0);
    expect(await t.prisma.day.count({ where: { tripId: trip.id } })).toBe(0);
  });

  it('answers_404_to_a_non_owner_and_keeps_the_trip', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const trip = await publishTrip(owner.agent, (await newTrip(owner)).id);

    const response = await sendRaw(stranger.agent, endpoints.deleteTrip, {
      params: { tripId: trip.id },
    });

    expect(response.status).toBe(404);
    expect(await t.prisma.trip.count({ where: { id: trip.id } })).toBe(1);
  });

  it('keeps_copies_of_a_deleted_trip', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const trip = await publishTrip(owner.agent, (await newTrip(owner)).id);
    const copy = await callOk(copier.agent, 'copyTrip', { params: { tripId: trip.id }, body: {} });

    await callOk(owner.agent, 'deleteTrip', { params: { tripId: trip.id } });

    const kept = await t.prisma.trip.findUniqueOrThrow({ where: { id: copy.id } });
    expect(kept.copiedFromTripId).toBeNull();
  });
});

describe('E23 rotateShareToken', () => {
  it('replaces_the_token_and_the_old_one_stops_working', async () => {
    const [owner, copier] = await Promise.all([createUser(t), createUser(t)]);
    const trip = await publishTrip(owner.agent, (await newTrip(owner)).id, 'link');

    const rotated = await callOk(owner.agent, 'rotateShareToken', { params: { tripId: trip.id } });
    const withOld = await sendRaw(copier.agent, endpoints.copySharedTrip, {
      params: { shareToken: trip.shareToken ?? '' },
      body: {},
    });
    const withNew = await sendRaw(copier.agent, endpoints.copySharedTrip, {
      params: { shareToken: rotated.shareToken },
      body: {},
    });

    expect(rotated.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(rotated.shareToken).not.toBe(trip.shareToken);
    expect(withOld.status).toBe(404);
    expect(withNew.status).toBe(201);
  });

  it('refuses_a_private_trip', async () => {
    const user = await createUser(t);
    const trip = await newTrip(user);

    const response = await sendRaw(user.agent, endpoints.rotateShareToken, {
      params: { tripId: trip.id },
    });

    expect(response.status).toBe(409);
    expect(problemDetailsSchema.parse(response.body).code).toBe('trip_is_private');
  });

  it('answers_404_to_a_non_owner_and_keeps_the_token', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const trip = await publishTrip(owner.agent, (await newTrip(owner)).id);

    const response = await sendRaw(stranger.agent, endpoints.rotateShareToken, {
      params: { tripId: trip.id },
    });

    expect(response.status).toBe(404);
    const row = await t.prisma.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(row.shareToken).toBe(trip.shareToken);
  });

  it('requires_a_session', async () => {
    const response = await sendRaw(anonymous(), endpoints.rotateShareToken, {
      params: { tripId: UNKNOWN_ID },
    });

    expect(response.status).toBe(401);
  });
});
