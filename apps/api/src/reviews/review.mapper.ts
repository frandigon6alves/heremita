import type { Review } from '@heremita/shared';
import { fromDbLocale } from '../auth/me.mapper.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Prisma `select` of everything a `Review` payload is built from. */
export const REVIEW_SELECT = {
  id: true,
  rating: true,
  body: true,
  visitedOn: true,
  language: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  place: { select: { id: true, name: true, category: true } },
  author: { select: { id: true, displayName: true, isDemo: true } },
} as const satisfies Prisma.ReviewSelect;

export type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

/** `visited_on` holds the first day of the visit month: `2026-09-01` → `2026-09`. */
export function toVisitedMonth(visitedOn: Date): string {
  return visitedOn.toISOString().slice(0, 7);
}

export function toReview(row: ReviewRow, viewerId: string | null): Review {
  return {
    id: row.id,
    place: row.place,
    rating: row.rating,
    body: row.body,
    visitedMonth: toVisitedMonth(row.visitedOn),
    language: fromDbLocale(row.language),
    author: row.author,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isMine: row.author.id === viewerId,
  };
}
