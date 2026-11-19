import {
  addTripPlaceResponseSchema,
  endpoints,
  LIMITS,
  type Locale,
  type PlaceKey,
  type TripPlanOwner,
} from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, cacheKeys } from '../../src/providers/core/cache-keys.js';
import type { PlaceResult } from '../../src/providers/core/contract.js';
import { ProviderCacheService } from '../../src/providers/core/provider-cache.service.js';
import { FakeGeocoder } from '../../src/providers/fake/fake-geocoder.js';
import { GAZETTEER } from '../../src/providers/fake/gazetteer.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { snapshotTrip } from '../support/authz-world.js';
import { addPlace, createTrip, createUser, getPlan, type TestUser } from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';
import {
  anonymous,
  expectDensePositions,
  expectProblem,
  fillDay,
  fillTripPlaces,
  planVersionOf,
  UNKNOWN_ID,
} from './plan-support.js';

/** The fake geocoder, counting save-time lookups (the only upstream call E29 may make). */
class CountingGeocoder extends FakeGeocoder {
  lookups = 0;

  override lookup(keys: readonly PlaceKey[], locale: Locale): Promise<PlaceResult[]> {
    this.lookups += 1;
    return super.lookup(keys, locale);
  }
}

let t: TestApp;
let geocoder: CountingGeocoder;

beforeAll(async () => {
  geocoder = new CountingGeocoder();
  t = await buildTestApp({ geocoding: geocoder });
});

afterAll(async () => {
  await t.close();
});

/** A key of the right shape that the gazetteer does not know. */
const FORGED_KEY = 'osm:N:999999999999';

function gazetteerPlace(index: number) {
  const place = GAZETTEER[index];
  if (!place) {
    throw new Error(`The gazetteer has no place ${index}`);
  }
  return place;
}

function dayOf(plan: TripPlanOwner, index = 0) {
  const day = plan.days[index];
  if (!day) {
    throw new Error(`The trip has no day ${index}`);
  }
  return day;
}

async function emptyTrip(owner: TestUser, days = 1): Promise<TripPlanOwner> {
  return createTrip(owner.agent, { days });
}

describe('E29 addTripPlace', () => {
  it('adds_an_osm_place_as_an_idea_resolved_from_its_key', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);
    const place = gazetteerPlace(0);

    const response = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: place.key }, note: '  Go early  ' },
    });

    expect(response.status).toBe(201);
    const added = addTripPlaceResponseSchema.parse(response.body);
    expect(response.headers.location).toBe(
      `/api/v1/trips/${plan.trip.id}/places/${added.tripPlace.id}`,
    );
    expect(added).toMatchObject({
      stopId: null,
      planVersion: plan.planVersion + 1,
      tripPlace: {
        note: 'Go early',
        rating: { count: 0, average: null, distribution: null },
        place: {
          source: 'osm',
          key: place.key,
          name: place.localized['pt-BR'].name,
          category: place.category,
          location: place.location,
          countryCode: place.countryCode,
        },
      },
    });
    expect(await planVersionOf(t, plan.trip.id)).toBe(plan.planVersion + 1);
  });

  it('refuses_client_sent_names_or_coordinates_for_an_osm_place', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);

    const response = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: gazetteerPlace(0).key, name: 'Fake name' } },
    });

    const problem = expectProblem(response, 422, 'validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toContain('/body/place/name');
  });

  it('answers_422_with_a_pointer_for_an_invalid_note', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);

    const response = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: gazetteerPlace(0).key }, note: 'x'.repeat(4001) },
    });

    const problem = expectProblem(response, 422, 'validation_failed');
    expect(problem.errors?.map((error) => error.pointer)).toEqual(['/body/note']);
  });

  it('serves_the_place_a_search_cached_without_any_lookup', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);
    const cached: PlaceResult = {
      key: 'osm:N:4242424242',
      ref: { osmType: 'N', osmId: 4242424242 },
      name: 'Cached kiosk',
      label: 'Cached kiosk, Lisboa',
      category: 'cafe',
      kind: 'poi',
      osmKey: 'amenity',
      osmValue: 'cafe',
      location: { lng: -9.1, lat: 38.7 },
      address: { city: 'Lisboa', countryCode: 'pt' },
    };
    await t.app
      .get(ProviderCacheService)
      .set(cacheKeys.place(cached.key), cached, CACHE_TTL_MS.place);
    const lookupsBefore = geocoder.lookups;

    const added = await addPlace(owner.agent, plan.trip.id, cached.key);

    expect(added.tripPlace.place).toMatchObject({
      key: cached.key,
      name: 'Cached kiosk',
      label: 'Cached kiosk, Lisboa',
      countryCode: 'PT',
    });
    expect(geocoder.lookups).toBe(lookupsBefore);
  });

  it('answers_503_for_a_forged_key_it_cannot_resolve_and_writes_nothing', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);
    const placesBefore = await t.prisma.place.count();
    const lookupsBefore = geocoder.lookups;

    const response = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: FORGED_KEY } },
    });

    expectProblem(response, 503, 'geocoding_unavailable');
    expect(geocoder.lookups).toBe(lookupsBefore + 1);
    expect(await t.prisma.place.count()).toBe(placesBefore);
    expect(await planVersionOf(t, plan.trip.id)).toBe(plan.planVersion);
  });

  it('shares_one_canonical_place_row_between_trips', async () => {
    const [owner, other] = await Promise.all([createUser(t), createUser(t)]);
    const [first, second] = await Promise.all([emptyTrip(owner), emptyTrip(other)]);
    const key = gazetteerPlace(1).key;

    const a = await addPlace(owner.agent, first.trip.id, key);
    const b = await addPlace(other.agent, second.trip.id, key);

    expect(a.tripPlace.place.id).toBe(b.tripPlace.place.id);
    expect(await t.prisma.place.count({ where: { id: a.tripPlace.place.id } })).toBe(1);
  });

  it('schedules_the_place_at_the_clamped_index_of_a_day', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 1, stopsPerDay: 2 });
    const day = dayOf(plan);

    const first = await callOk(owner.agent, 'addTripPlace', {
      params: { tripId: plan.trip.id },
      body: {
        place: { type: 'osm', key: gazetteerPlace(10).key },
        schedule: { dayId: day.id, index: 0 },
      },
    });
    const last = await callOk(owner.agent, 'addTripPlace', {
      params: { tripId: plan.trip.id },
      body: {
        place: { type: 'osm', key: gazetteerPlace(11).key },
        schedule: { dayId: day.id, index: 99 },
      },
    });

    const read = await getPlan(owner.agent, plan.trip.id);
    expect(dayOf(read).stops.map((stop) => stop.id)).toEqual([
      first.stopId,
      ...day.stops.map((stop) => stop.id),
      last.stopId,
    ]);
    expect(last.planVersion).toBe(plan.planVersion + 2);
    await expectDensePositions(t, plan.trip.id);
  });

  it('adds_a_custom_pin_owned_by_the_trip', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);

    const added = await callOk(owner.agent, 'addTripPlace', {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'custom', name: ' Our flat ', location: { lng: -9.14, lat: 38.71 } } },
    });

    expect(added.tripPlace.place).toMatchObject({
      source: 'custom',
      key: null,
      name: 'Our flat',
      category: 'other',
      label: null,
      location: { lng: -9.14, lat: 38.71 },
    });
    const row = await t.prisma.place.findUniqueOrThrow({ where: { id: added.tripPlace.place.id } });
    expect(row.tripId).toBe(plan.trip.id);
  });

  it('answers_409_with_the_existing_trip_place_when_the_place_is_already_in_the_trip', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);
    const key = gazetteerPlace(2).key;
    const existing = await addPlace(owner.agent, plan.trip.id, key);
    const before = await snapshotTrip(t, plan.trip.id);

    const response = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key } },
    });

    const problem = expectProblem(response, 409, 'place_already_in_trip');
    expect(problem.tripPlaceId).toBe(existing.tripPlace.id);
    expect(await snapshotTrip(t, plan.trip.id)).toEqual(before);
  });

  it('accepts_the_300th_place_and_refuses_the_301st', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);
    await fillTripPlaces(t, plan.trip.id, LIMITS.PLACES_PER_TRIP - 1);

    const last = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: gazetteerPlace(3).key } },
    });
    const over = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'custom', name: 'One too many', location: { lng: 0, lat: 0 } } },
    });

    expect(last.status).toBe(201);
    expectProblem(over, 409, 'limit_reached');
    expect(await t.prisma.tripPlace.count({ where: { tripId: plan.trip.id } })).toBe(
      LIMITS.PLACES_PER_TRIP,
    );
  });

  it('answers_409_day_full_when_scheduling_on_a_full_day_and_writes_nothing', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);
    const day = dayOf(plan);
    await fillDay(t, plan.trip.id, day.id, LIMITS.STOPS_PER_DAY);
    const before = await snapshotTrip(t, plan.trip.id);

    const response = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: gazetteerPlace(4).key }, schedule: { dayId: day.id } },
    });

    expectProblem(response, 409, 'day_full');
    expect(await snapshotTrip(t, plan.trip.id)).toEqual(before);
  });

  it('answers_404_not_found_for_a_day_of_another_trip', async () => {
    const owner = await createUser(t);
    const [plan, other] = await Promise.all([emptyTrip(owner), emptyTrip(owner)]);
    const before = await snapshotTrip(t, plan.trip.id);

    const response = await sendRaw(owner.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: {
        place: { type: 'osm', key: gazetteerPlace(5).key },
        schedule: { dayId: dayOf(other).id },
      },
    });

    expectProblem(response, 404, 'not_found');
    expect(await snapshotTrip(t, plan.trip.id)).toEqual(before);
  });

  it('answers_404_for_another_users_trip_without_any_lookup', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const plan = await emptyTrip(owner);
    const lookupsBefore = geocoder.lookups;

    const response = await sendRaw(stranger.agent, endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: FORGED_KEY } },
    });

    expectProblem(response, 404, 'trip_not_found');
    expect(geocoder.lookups).toBe(lookupsBefore);
  });

  it('answers_401_without_a_session', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);

    const response = await sendRaw(anonymous(t), endpoints.addTripPlace, {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'osm', key: gazetteerPlace(0).key } },
    });

    expectProblem(response, 401, 'unauthenticated');
  });
});

describe('E30 updateTripPlace', () => {
  async function tripWithPlaces(owner: TestUser) {
    const plan = await emptyTrip(owner);
    const osm = await addPlace(owner.agent, plan.trip.id, gazetteerPlace(6).key);
    const custom = await callOk(owner.agent, 'addTripPlace', {
      params: { tripId: plan.trip.id },
      body: {
        place: { type: 'custom', name: 'Hotel', category: 'lodging', location: { lng: 1, lat: 2 } },
      },
    });
    return {
      tripId: plan.trip.id,
      osm: osm.tripPlace,
      custom: custom.tripPlace,
      version: custom.planVersion,
    };
  }

  it('edits_the_note_without_moving_the_plan_version', async () => {
    const owner = await createUser(t);
    const trip = await tripWithPlaces(owner);

    const updated = await callOk(owner.agent, 'updateTripPlace', {
      params: { tripId: trip.tripId, tripPlaceId: trip.osm.id },
      body: { note: 'Closed on Mondays' },
    });
    const cleared = await callOk(owner.agent, 'updateTripPlace', {
      params: { tripId: trip.tripId, tripPlaceId: trip.osm.id },
      body: { note: null },
    });

    expect(updated.tripPlace.note).toBe('Closed on Mondays');
    expect(cleared.tripPlace.note).toBeNull();
    expect([updated.planVersion, cleared.planVersion]).toEqual([trip.version, trip.version]);
    expect(await planVersionOf(t, trip.tripId)).toBe(trip.version);
  });

  it('renames_and_recategorises_a_custom_pin_without_moving_the_plan_version', async () => {
    const owner = await createUser(t);
    const trip = await tripWithPlaces(owner);

    const updated = await callOk(owner.agent, 'updateTripPlace', {
      params: { tripId: trip.tripId, tripPlaceId: trip.custom.id },
      body: { name: 'Flat', category: 'other', location: { lng: 1, lat: 2 } },
    });

    expect(updated.tripPlace.place).toMatchObject({ name: 'Flat', category: 'other' });
    expect(updated.planVersion).toBe(trip.version);
  });

  it('moves_the_plan_version_when_a_custom_pin_moves', async () => {
    const owner = await createUser(t);
    const trip = await tripWithPlaces(owner);

    const updated = await callOk(owner.agent, 'updateTripPlace', {
      params: { tripId: trip.tripId, tripPlaceId: trip.custom.id },
      body: { location: { lng: 1.5, lat: 2 } },
    });

    expect(updated.tripPlace.place.location).toEqual({ lng: 1.5, lat: 2 });
    expect(updated.planVersion).toBe(trip.version + 1);
    expect(await planVersionOf(t, trip.tripId)).toBe(trip.version + 1);
  });

  it('answers_422_when_editing_place_fields_of_an_osm_place', async () => {
    const owner = await createUser(t);
    const trip = await tripWithPlaces(owner);

    for (const body of [
      { name: 'Renamed' },
      { category: 'food' },
      { location: { lng: 0, lat: 0 } },
    ]) {
      const response = await sendRaw(owner.agent, endpoints.updateTripPlace, {
        params: { tripId: trip.tripId, tripPlaceId: trip.osm.id },
        body,
      });

      expectProblem(response, 422, 'not_a_custom_place');
    }
    const place = await t.prisma.place.findUniqueOrThrow({ where: { id: trip.osm.place.id } });
    expect(place.name).toBe(trip.osm.place.name);
  });

  it('answers_422_for_an_empty_body', async () => {
    const owner = await createUser(t);
    const trip = await tripWithPlaces(owner);

    const response = await sendRaw(owner.agent, endpoints.updateTripPlace, {
      params: { tripId: trip.tripId, tripPlaceId: trip.osm.id },
      body: {},
    });

    expectProblem(response, 422, 'validation_failed');
  });

  it('answers_404_for_a_trip_place_of_another_trip_or_an_unknown_one', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const mine = await tripWithPlaces(owner);
    const theirs = await tripWithPlaces(stranger);

    for (const tripPlaceId of [theirs.osm.id, UNKNOWN_ID]) {
      const response = await sendRaw(owner.agent, endpoints.updateTripPlace, {
        params: { tripId: mine.tripId, tripPlaceId },
        body: { note: 'mine now' },
      });

      expectProblem(response, 404, 'not_found');
    }
    const response = await sendRaw(owner.agent, endpoints.updateTripPlace, {
      params: { tripId: theirs.tripId, tripPlaceId: theirs.osm.id },
      body: { note: 'mine now' },
    });
    expectProblem(response, 404, 'trip_not_found');
    const row = await t.prisma.tripPlace.findUniqueOrThrow({ where: { id: theirs.osm.id } });
    expect(row.note).toBeNull();
  });
});

describe('E31 deleteTripPlace', () => {
  it('removes_its_stops_closes_up_the_days_and_keeps_the_canonical_place', async () => {
    const owner = await createUser(t);
    const plan = await createTrip(owner.agent, { days: 2, stopsPerDay: 3 });
    const [dayOne, dayTwo] = [dayOf(plan, 0), dayOf(plan, 1)];
    const target = dayOne.stops[1];
    if (!target) {
      throw new Error('Day 1 needs a second stop');
    }
    await callOk(owner.agent, 'addStop', {
      params: { tripId: plan.trip.id, dayId: dayTwo.id },
      body: { tripPlaceId: target.tripPlaceId, index: 0 },
    });
    const placeId = plan.places.find((place) => place.id === target.tripPlaceId)?.place.id ?? '';
    const version = await planVersionOf(t, plan.trip.id);

    const change = await callOk(owner.agent, 'deleteTripPlace', {
      params: { tripId: plan.trip.id, tripPlaceId: target.tripPlaceId },
    });

    const read = await getPlan(owner.agent, plan.trip.id);
    expect(change.planVersion).toBe(version + 1);
    expect(dayOf(read, 0).stops.map((stop) => stop.id)).toEqual(
      dayOne.stops.filter((stop) => stop.id !== target.id).map((stop) => stop.id),
    );
    expect(dayOf(read, 1).stops.map((stop) => stop.id)).toEqual(
      dayTwo.stops.map((stop) => stop.id),
    );
    expect(read.places.map((place) => place.id)).not.toContain(target.tripPlaceId);
    expect(await t.prisma.place.count({ where: { id: placeId } })).toBe(1);
    await expectDensePositions(t, plan.trip.id);
  });

  it('deletes_the_place_row_of_a_custom_pin', async () => {
    const owner = await createUser(t);
    const plan = await emptyTrip(owner);
    const custom = await callOk(owner.agent, 'addTripPlace', {
      params: { tripId: plan.trip.id },
      body: { place: { type: 'custom', name: 'Pin', location: { lng: 3, lat: 4 } } },
    });

    await callOk(owner.agent, 'deleteTripPlace', {
      params: { tripId: plan.trip.id, tripPlaceId: custom.tripPlace.id },
    });

    expect(await t.prisma.place.count({ where: { id: custom.tripPlace.place.id } })).toBe(0);
  });

  it('answers_404_once_deleted_and_for_another_trips_place', async () => {
    const [owner, stranger] = await Promise.all([createUser(t), createUser(t)]);
    const plan = await emptyTrip(owner);
    const theirs = await emptyTrip(stranger);
    const added = await addPlace(owner.agent, plan.trip.id, gazetteerPlace(7).key);
    const foreign = await addPlace(stranger.agent, theirs.trip.id, gazetteerPlace(8).key);
    await callOk(owner.agent, 'deleteTripPlace', {
      params: { tripId: plan.trip.id, tripPlaceId: added.tripPlace.id },
    });

    for (const tripPlaceId of [added.tripPlace.id, foreign.tripPlace.id]) {
      const response = await sendRaw(owner.agent, endpoints.deleteTripPlace, {
        params: { tripId: plan.trip.id, tripPlaceId },
      });

      expectProblem(response, 404, 'not_found');
    }
    expect(await t.prisma.tripPlace.count({ where: { id: foreign.tripPlace.id } })).toBe(1);
  });
});
