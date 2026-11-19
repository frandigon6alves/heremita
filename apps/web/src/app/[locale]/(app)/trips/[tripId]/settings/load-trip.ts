import 'server-only';
import type { TripOwner } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { serverFetchOrNotFound } from '@/lib/api/server';

/**
 * E20 once per render (metadata + page). Settings are the owner's: a missing
 * trip and someone else's public trip both read as "not found".
 */
export const loadOwnTrip = cache(async (tripId: string): Promise<TripOwner> => {
  const trip = await serverFetchOrNotFound(apiRoutes.getTrip, { params: { tripId } });
  if (trip.viewerRole !== 'owner') {
    notFound();
  }
  return trip;
});
