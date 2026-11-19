import 'server-only';
import { apiRoutes } from '@heremita/shared/api-routes';
import { cache } from 'react';
import { serverFetchOrNotFound } from '@/lib/api/server';

/**
 * E24 once per render (metadata + page), with the time it was read (the
 * client query's `initialDataUpdatedAt`). A trip the viewer may not see is
 * the 404 page.
 */
export const loadPlan = cache(async (tripId: string) => {
  const plan = await serverFetchOrNotFound(apiRoutes.getTripPlan, { params: { tripId } });
  return { plan, fetchedAt: Date.now() };
});

/** E26 by share token, always the viewer shape (even for the owner); a dead link is the 404 page. */
export const loadSharedPlan = cache(async (shareToken: string) => {
  const plan = await serverFetchOrNotFound(apiRoutes.getSharedPlan, { params: { shareToken } });
  return { plan, fetchedAt: Date.now() };
});
