import { LIMITS, type ReportItem } from '@heremita/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Prisma `select` of everything a `ReportItem` is built from. */
export const REPORT_ITEM_SELECT = {
  id: true,
  targetType: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  reporter: { select: { id: true, displayName: true, isDemo: true } },
  review: { select: { id: true, body: true, status: true } },
  trip: { select: { id: true, title: true, moderationHiddenAt: true } },
} as const satisfies Prisma.ReportSelect;

export type ReportItemRow = Prisma.ReportGetPayload<{ select: typeof REPORT_ITEM_SELECT }>;

/** The first `REPORT_EXCERPT_MAX` UTF-16 units, never ending inside a surrogate pair. */
export function excerptOf(text: string): string {
  const cut = text.slice(0, LIMITS.REPORT_EXCERPT_MAX);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

function targetOf(row: ReportItemRow): {
  target: ReportItem['target'];
  contentStatus: ReportItem['contentStatus'];
} {
  if (row.review) {
    return {
      target: { type: 'review', id: row.review.id, excerpt: excerptOf(row.review.body) },
      contentStatus: row.review.status === 'hidden' ? 'hidden' : 'visible',
    };
  }
  if (row.trip) {
    return {
      target: { type: 'trip', id: row.trip.id, excerpt: excerptOf(row.trip.title) },
      contentStatus: row.trip.moderationHiddenAt === null ? 'visible' : 'hidden',
    };
  }
  // reports_target_chk: every report names exactly one review or one trip.
  throw new Error(`Report ${row.id} has no target`);
}

export function toReportItem(row: ReportItemRow): ReportItem {
  return {
    id: row.id,
    ...targetOf(row),
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporter: row.reporter,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
