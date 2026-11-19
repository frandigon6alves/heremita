import 'server-only';
import { endpoints, reviewSortSchema, type ReviewSort } from '@heremita/shared';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiProblemError } from '@/lib/api/problem';
import { serverFetch } from '@/lib/api/server';

/** E44 once per render (metadata + page); an unknown or custom place is a 404 page. */
export const loadPlace = cache(async (placeId: string) => {
  try {
    return await serverFetch(endpoints.getPlace, { params: { placeId } });
  } catch (error) {
    if (error instanceof ApiProblemError && error.status === 404) {
      notFound();
    }
    throw error;
  }
});

/** `?sort=` of the place page; anything else reads as the default. */
export function parseSort(value: string | string[] | undefined): ReviewSort {
  const parsed = reviewSortSchema.safeParse(value);
  return parsed.success ? parsed.data : 'recent';
}

/**
 * First page of E45 for the server render. `undefined` when it fails: the
 * review list then fetches (and shows its own error state) in the browser,
 * so a review hiccup never takes the whole place page down.
 */
export async function loadFirstReviews(placeId: string, sort: ReviewSort) {
  try {
    return await serverFetch(endpoints.listPlaceReviews, {
      params: { placeId },
      query: { sort },
    });
  } catch {
    return undefined;
  }
}
