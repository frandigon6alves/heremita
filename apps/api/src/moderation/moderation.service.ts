import { Inject, Injectable } from '@nestjs/common';
import type {
  EndpointInput,
  endpoints,
  ModerationDecision,
  Page,
  ReportItem,
} from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { CURSOR_TUPLES, decodeCursor, toPage } from '../core/cursor.js';
import { ApiProblem } from '../core/http/api-problem.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REPORT_ITEM_SELECT, toReportItem } from './report-item.mapper.js';

type ListQuery = EndpointInput<typeof endpoints.listReports>['query'];
type Tx = Prisma.TransactionClient;

interface ReportTarget {
  reviewId: string | null;
  tripId: string | null;
}

const RESOLVED_STATUS = {
  hide_content: 'actioned',
  restore_content: 'actioned',
  dismiss: 'dismissed',
} as const satisfies Record<ModerationDecision, 'actioned' | 'dismissed'>;

/**
 * The moderation queue (E50) and decisions on it (E51). Content changes only
 * here, by a moderator's hand (V50); a decision resolves every open report on
 * the same target alike.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** E50, oldest first: `(created_at ASC, id ASC)`. */
  async list(query: ListQuery): Promise<Page<ReportItem>> {
    const after = decodeCursor(CURSOR_TUPLES.reports, query.cursor);
    const rows = await this.prisma.report.findMany({
      where: {
        status: query.status,
        ...(after && {
          OR: [{ createdAt: { gt: after[0] } }, { createdAt: after[0], id: { gt: after[1] } }],
        }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      select: REPORT_ITEM_SELECT,
    });
    const page = toPage(rows, query.limit, CURSOR_TUPLES.reports, (row) => [row.createdAt, row.id]);
    return { items: page.items.map(toReportItem), nextCursor: page.nextCursor };
  }

  /** E51. */
  async decide(
    moderatorId: string,
    reportId: string,
    decision: ModerationDecision,
  ): Promise<ReportItem> {
    const now = this.clock.now();
    const row = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({
        where: { id: reportId },
        select: { reviewId: true, tripId: true },
      });
      if (!report) {
        throw new ApiProblem('not_found', 'No such report.');
      }
      await applyToContent(tx, report, decision, now);
      await tx.report.updateMany({
        where: {
          OR: [
            { id: reportId },
            { status: 'open', reviewId: report.reviewId, tripId: report.tripId },
          ],
        },
        data: { status: RESOLVED_STATUS[decision], resolvedById: moderatorId, resolvedAt: now },
      });
      return tx.report.findUniqueOrThrow({ where: { id: reportId }, select: REPORT_ITEM_SELECT });
    });
    return toReportItem(row);
  }
}

/**
 * Hides or restores the reported review or trip. Raw SQL on purpose: a
 * moderation change must not bump `updated_at`, which orders the author's lists.
 */
async function applyToContent(
  tx: Tx,
  target: ReportTarget,
  decision: ModerationDecision,
  now: Date,
): Promise<void> {
  if (decision === 'dismiss') {
    return;
  }
  const hide = decision === 'hide_content';
  if (target.reviewId !== null) {
    await (hide
      ? tx.$executeRaw`UPDATE reviews SET status = 'hidden', hidden_at = ${now}
          WHERE id = ${target.reviewId}::uuid AND status = 'published'`
      : tx.$executeRaw`UPDATE reviews SET status = 'published', hidden_at = NULL
          WHERE id = ${target.reviewId}::uuid`);
  }
  if (target.tripId !== null) {
    await (hide
      ? tx.$executeRaw`UPDATE trips SET moderation_hidden_at = ${now}
          WHERE id = ${target.tripId}::uuid AND moderation_hidden_at IS NULL`
      : tx.$executeRaw`UPDATE trips SET moderation_hidden_at = NULL
          WHERE id = ${target.tripId}::uuid`);
  }
}
