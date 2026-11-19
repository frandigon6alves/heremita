import 'server-only';
import { apiRoutes } from '@heremita/shared/api-routes';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiProblemError } from '@/lib/api/problem';
import { serverFetch } from '@/lib/api/server';

/**
 * E24 once per render (metadata + page), with the time it was read (the
 * client query's `initialDataUpdatedAt`). A trip the viewer may not see is
 * the 404 page.
 */
export const loadPlan = cache(async (tripId: string) => {
  try {
    const plan = await serverFetch(apiRoutes.getTripPlan, { params: { tripId } });
    return { plan, fetchedAt: Date.now() };
  } catch (error) {
    if (error instanceof ApiProblemError && error.status === 404) {
      notFound();
    }
    throw error;
  }
});

/** E26 by share token, always the viewer shape (even for the owner); a dead link is the 404 page. */
export const loadSharedPlan = cache(async (shareToken: string) => {
  try {
    const plan = await serverFetch(apiRoutes.getSharedPlan, { params: { shareToken } });
    return { plan, fetchedAt: Date.now() };
  } catch (error) {
    if (error instanceof ApiProblemError && error.status === 404) {
      notFound();
    }
    throw error;
  }
});
