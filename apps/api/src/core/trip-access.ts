import type { TripVisibility } from '../generated/prisma/client.js';

export type TripRole = 'owner' | 'viewer';

/** How a trip was addressed: by id (`/trips/{tripId}/…`) or by share token (`/shared/{shareToken}/…`). */
export type TripRef = { tripId: string } | { shareToken: string };

/** The columns an access decision needs. */
export interface TripAccessFacts {
  ownerId: string;
  visibility: TripVisibility;
  moderationHiddenAt: Date | null;
}

/**
 * Who the viewer is to this trip (§I.api.mechanics "TripAccessService"), or
 * `null` when the trip must look missing (404, never 403):
 * - by id: the owner sees it in any state; others only when public and not hidden;
 * - by token (the caller already matched it): a viewer shape for everyone,
 *   the owner included, while the trip is link or public and not hidden.
 */
export function decideTripAccess(
  trip: TripAccessFacts | null,
  via: 'id' | 'token',
  viewerId: string | null,
): TripRole | null {
  if (!trip) {
    return null;
  }
  const hidden = trip.moderationHiddenAt !== null;
  if (via === 'token') {
    return trip.visibility !== 'private' && !hidden ? 'viewer' : null;
  }
  if (viewerId !== null && trip.ownerId === viewerId) {
    return 'owner';
  }
  return trip.visibility === 'public' && !hidden ? 'viewer' : null;
}
