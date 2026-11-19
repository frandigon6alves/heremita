import 'server-only';
import type { ReviewSort } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { isOneOf, REVIEW_SORTS } from '@heremita/shared/plain';
import { cache } from 'react';
import { serverFetch, serverFetchOrNotFound } from '@/lib/api/server';

/** E44 once per render (metadata + page); an unknown or custom place is a 404 page. */
export const loadPlace = cache((placeId: string) =>
  serverFetchOrNotFound(apiRoutes.getPlace, { params: { placeId } }),
);

/** `?sort=` of the place page; anything else reads as the default. */
export function parseSort(value: string | string[] | undefined): ReviewSort {
  return isOneOf(REVIEW_SORTS, value) ? value : 'recent';
}

/**
 * First page of E45 for the server render. `undefined` when it fails: the
 * review list then fetches (and shows its own error state) in the browser,
 * so a review hiccup never takes the whole place page down.
 */
export async function loadFirstReviews(placeId: string, sort: ReviewSort) {
  try {
    return await serverFetch(apiRoutes.listPlaceReviews, {
      params: { placeId },
      query: { sort },
    });
  } catch {
    return undefined;
  }
}
