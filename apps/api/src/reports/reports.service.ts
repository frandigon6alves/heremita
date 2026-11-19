import { Inject, Injectable } from '@nestjs/common';
import type { CreatedId, EndpointInput, endpoints } from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { ApiProblem } from '../core/http/api-problem.js';
import { violatedUniqueIndex } from '../core/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

type CreateBody = EndpointInput<typeof endpoints.createReport>['body'];
type Target = CreateBody['target'];

/** Who wrote the target, or `null` when the caller cannot see it. */
type TargetAuthor = { authorId: string } | null;

function targetNotFound(): ApiProblem {
  return new ApiProblem('not_found', 'Nothing to report here.');
}

/**
 * Reports on reviews and trips (E49). A report only queues the content for a
 * moderator: however many arrive, the content stays as it is (V50).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(reporterId: string, body: CreateBody): Promise<CreatedId> {
    const target = await this.visibleAuthorOf(body.target, reporterId);
    if (!target) {
      throw targetNotFound();
    }
    if (target.authorId === reporterId) {
      throw new ApiProblem('cannot_report_own', 'You cannot report your own content.');
    }
    try {
      return await this.prisma.report.create({
        data: {
          reporterId,
          targetType: body.target.type,
          reviewId: body.target.type === 'review' ? body.target.id : null,
          tripId: body.target.type === 'trip' ? body.target.id : null,
          reason: body.reason,
          details: body.details || null,
          createdAt: this.clock.now(),
        },
        select: { id: true },
      });
    } catch (error) {
      if (violatedUniqueIndex(error) !== undefined) {
        throw new ApiProblem('already_reported', 'You already reported this.');
      }
      throw error;
    }
  }

  /**
   * A review is visible when published, or to its author. A trip is visible
   * when shared (`link` or `public`) and not hidden by a moderator, or to its
   * owner: a link-trip reader knows the id from the page they report from.
   */
  private async visibleAuthorOf(target: Target, viewerId: string): Promise<TargetAuthor> {
    if (target.type === 'review') {
      const review = await this.prisma.review.findUnique({
        where: { id: target.id },
        select: { authorId: true, status: true },
      });
      return review && (review.status === 'published' || review.authorId === viewerId)
        ? { authorId: review.authorId }
        : null;
    }
    const trip = await this.prisma.trip.findUnique({
      where: { id: target.id },
      select: { ownerId: true, visibility: true, moderationHiddenAt: true },
    });
    const shared = trip?.visibility !== 'private' && trip?.moderationHiddenAt === null;
    return trip && (shared || trip.ownerId === viewerId) ? { authorId: trip.ownerId } : null;
  }
}
