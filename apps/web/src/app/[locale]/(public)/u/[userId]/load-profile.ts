import 'server-only';
import { endpoints } from '@heremita/shared';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiProblemError } from '@/lib/api/problem';
import { serverFetch } from '@/lib/api/server';

/** E15 once per render (metadata + page); an unknown user is a 404 page. */
export const loadProfile = cache(async (userId: string) => {
  try {
    return await serverFetch(endpoints.getUserProfile, { params: { userId } });
  } catch (error) {
    if (error instanceof ApiProblemError && error.status === 404) {
      notFound();
    }
    throw error;
  }
});

/**
 * First pages of E16 + E17 for the server render; a failed one is
 * `undefined` and its list fetches (and shows its own error) in the browser.
 */
export async function loadFirstPages(userId: string) {
  const [trips, reviews] = await Promise.all([
    serverFetch(endpoints.listUserTrips, { params: { userId } }).catch(() => undefined),
    serverFetch(endpoints.listUserReviews, { params: { userId } }).catch(() => undefined),
  ]);
  return { trips, reviews };
}
