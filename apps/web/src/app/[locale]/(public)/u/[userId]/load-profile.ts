import 'server-only';
import { apiRoutes } from '@heremita/shared/api-routes';
import { cache } from 'react';
import { serverFetch, serverFetchOrNotFound } from '@/lib/api/server';

/** E15 once per render (metadata + page); an unknown user is a 404 page. */
export const loadProfile = cache((userId: string) =>
  serverFetchOrNotFound(apiRoutes.getUserProfile, { params: { userId } }),
);

/**
 * First pages of E16 + E17 for the server render; a failed one is
 * `undefined` and its list fetches (and shows its own error) in the browser.
 */
export async function loadFirstPages(userId: string) {
  const [trips, reviews] = await Promise.all([
    serverFetch(apiRoutes.listUserTrips, { params: { userId } }).catch(() => undefined),
    serverFetch(apiRoutes.listUserReviews, { params: { userId } }).catch(() => undefined),
  ]);
  return { trips, reviews };
}
