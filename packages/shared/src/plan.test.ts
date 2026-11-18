import { describe, expect, it } from 'vitest';
import {
  addTripPlaceBodySchema,
  stopOrderBodySchema,
  tripPlanSchema,
  updateTripPlaceBodySchema,
} from './plan.js';

const ids = {
  user: '0193a000-0000-7000-8000-000000000101',
  trip: '0193a000-0000-7000-8000-000000000201',
  place: '0193a000-0000-7000-8000-000000000301',
  tripPlace: '0193a000-0000-7000-8000-000000000401',
  day: '0193a000-0000-7000-8000-000000000501',
  stop: '0193a000-0000-7000-8000-000000000601',
};

const ratingWithoutReviews = { count: 0, average: null, distribution: null };

/** The owner shape, as an API bug could hand it to the viewer response parser. */
const ownerShapedPlan = {
  viewerRole: 'viewer',
  trip: {
    viewerRole: 'viewer',
    id: ids.trip,
    title: 'Lisboa em 3 dias',
    description: null,
    destination: null,
    startDate: '2026-05-01',
    shareToken: 'abcdefghijklmnopqrstuv',
    dayCount: 1,
    placeCount: 1,
    defaultMode: 'walk',
    visibility: 'public',
    author: { id: ids.user, displayName: 'Viajante Demo', isDemo: true },
    copiedFrom: null,
    publishedAt: '2026-05-02T10:00:00.000Z',
    copyCount: 0,
  },
  planVersion: 3,
  places: [
    {
      id: ids.tripPlace,
      place: {
        id: ids.place,
        source: 'osm',
        key: 'osm:W:1370081491',
        name: 'Torre de Belém',
        label: 'Belém, Lisboa',
        category: 'sight',
        location: { lng: -9.2159, lat: 38.6916 },
        countryCode: 'PT',
      },
      note: 'Book tickets: door code 4411',
      rating: ratingWithoutReviews,
      addedAt: '2026-05-01T09:00:00.000Z',
    },
  ],
  days: [
    {
      id: ids.day,
      number: 1,
      date: '2026-05-01',
      mode: 'walk',
      modeOverride: null,
      stops: [{ id: ids.stop, tripPlaceId: ids.tripPlace, modeToNext: null }],
    },
  ],
  routes: [{ dayId: ids.day, legs: [], distanceMeters: null, durationSeconds: null }],
};

describe('tripPlanSchema', () => {
  it('strips_owner_only_fields_from_the_viewer_shape', () => {
    const plan = tripPlanSchema.parse(ownerShapedPlan);

    expect(plan.viewerRole).toBe('viewer');
    expect(plan.trip).not.toHaveProperty('startDate');
    expect(plan.trip).not.toHaveProperty('shareToken');
    expect(plan.places[0]).not.toHaveProperty('note');
    expect(plan.days[0]).not.toHaveProperty('date');
  });

  it('keeps_owner_only_fields_in_the_owner_shape', () => {
    const ownerPlan = {
      ...ownerShapedPlan,
      viewerRole: 'owner',
      trip: {
        ...ownerShapedPlan.trip,
        viewerRole: 'owner',
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-05-01T09:00:00.000Z',
      },
    };

    const plan = tripPlanSchema.parse(ownerPlan);

    expect(plan.viewerRole).toBe('owner');
    expect(plan.trip).toHaveProperty('shareToken', 'abcdefghijklmnopqrstuv');
    expect(plan.places[0]).toHaveProperty('note', 'Book tickets: door code 4411');
  });
});

describe('addTripPlaceBodySchema', () => {
  it('defaults_note_and_schedule_to_null_and_custom_category_to_other', () => {
    const body = addTripPlaceBodySchema.parse({
      place: { type: 'custom', name: ' Hotel ', location: { lng: -9.14, lat: 38.71 } },
    });

    expect(body).toEqual({
      place: {
        type: 'custom',
        name: 'Hotel',
        category: 'other',
        location: { lng: -9.14, lat: 38.71 },
      },
      note: null,
      schedule: null,
    });
  });

  it('rejects_coordinates_sent_with_an_osm_place', () => {
    const result = addTripPlaceBodySchema.safeParse({
      place: { type: 'osm', key: 'osm:N:1', location: { lng: 0, lat: 0 } },
    });

    expect(result.success).toBe(false);
  });

  it('rejects_a_malformed_place_key', () => {
    const result = addTripPlaceBodySchema.safeParse({ place: { type: 'osm', key: 'osm:X:0' } });

    expect(result.success).toBe(false);
  });
});

describe('updateTripPlaceBodySchema', () => {
  it('rejects_an_empty_update', () => {
    expect(updateTripPlaceBodySchema.safeParse({}).success).toBe(false);
  });

  it('accepts_clearing_the_note', () => {
    expect(updateTripPlaceBodySchema.parse({ note: null })).toEqual({ note: null });
  });
});

describe('stopOrderBodySchema', () => {
  it('rejects_duplicate_stop_ids_at_the_stop_ids_pointer', () => {
    const result = stopOrderBodySchema.safeParse({ stopIds: [ids.stop, ids.stop] });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['stopIds']]);
  });
});
