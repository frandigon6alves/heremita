import { describe, expect, it } from 'vitest';
import { decideTripAccess, type TripAccessFacts } from './trip-access.js';

const OWNER = 'owner-id';
const OTHER = 'other-id';
const HIDDEN_AT = new Date('2026-11-01T00:00:00.000Z');

function trip(overrides: Partial<TripAccessFacts> = {}): TripAccessFacts {
  return { ownerId: OWNER, visibility: 'private', moderationHiddenAt: null, ...overrides };
}

describe('decideTripAccess by id', () => {
  it('gives_the_owner_the_owner_role_in_every_state', () => {
    for (const visibility of ['private', 'link', 'public'] as const) {
      expect(decideTripAccess(trip({ visibility }), 'id', OWNER)).toBe('owner');
    }
    expect(decideTripAccess(trip({ moderationHiddenAt: HIDDEN_AT }), 'id', OWNER)).toBe('owner');
  });

  it('shows_public_trips_to_everyone_else_as_viewer', () => {
    const publicTrip = trip({ visibility: 'public' });

    expect(decideTripAccess(publicTrip, 'id', OTHER)).toBe('viewer');
    expect(decideTripAccess(publicTrip, 'id', null)).toBe('viewer');
  });

  it('hides_private_link_and_moderated_trips_from_others', () => {
    expect(decideTripAccess(trip(), 'id', OTHER)).toBeNull();
    expect(decideTripAccess(trip({ visibility: 'link' }), 'id', null)).toBeNull();
    expect(
      decideTripAccess(trip({ visibility: 'public', moderationHiddenAt: HIDDEN_AT }), 'id', OTHER),
    ).toBeNull();
  });

  it('answers_null_for_a_missing_trip', () => {
    expect(decideTripAccess(null, 'id', OWNER)).toBeNull();
  });
});

describe('decideTripAccess by share token', () => {
  it('gives_everyone_the_viewer_shape_of_a_link_or_public_trip_owner_included', () => {
    for (const visibility of ['link', 'public'] as const) {
      expect(decideTripAccess(trip({ visibility }), 'token', null)).toBe('viewer');
      expect(decideTripAccess(trip({ visibility }), 'token', OWNER)).toBe('viewer');
    }
  });

  it('refuses_a_token_of_a_private_or_moderated_trip_even_to_its_owner', () => {
    expect(decideTripAccess(trip(), 'token', OWNER)).toBeNull();
    expect(
      decideTripAccess(trip({ visibility: 'link', moderationHiddenAt: HIDDEN_AT }), 'token', OWNER),
    ).toBeNull();
  });
});
