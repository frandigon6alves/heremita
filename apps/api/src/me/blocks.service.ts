import { Inject, Injectable } from '@nestjs/common';
import type { EndpointInput, endpoints, Page, UserCard } from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { CURSOR_TUPLES, decodeCursor, toPage } from '../core/cursor.js';
import { ApiProblem } from '../core/http/api-problem.js';
import { userNotFound } from '../core/http/problems.js';
import { USER_CARD_SELECT } from '../core/user-card.js';
import { PrismaService } from '../prisma/prisma.service.js';

type ListBlocksQuery = EndpointInput<typeof endpoints.listBlocks>['query'];

/** Users the caller blocked (E12–E14): their trips and reviews disappear from the caller's views. */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** E12, newest block first: `(created_at DESC, blocked_id DESC)`. */
  async list(blockerId: string, query: ListBlocksQuery): Promise<Page<UserCard>> {
    const after = decodeCursor(CURSOR_TUPLES.blocks, query.cursor);
    const rows = await this.prisma.userBlock.findMany({
      where: {
        blockerId,
        ...(after && {
          OR: [
            { createdAt: { lt: after[0] } },
            { createdAt: after[0], blockedId: { lt: after[1] } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
      take: query.limit + 1,
      select: {
        createdAt: true,
        blocked: { select: USER_CARD_SELECT },
      },
    });
    const page = toPage(rows, query.limit, CURSOR_TUPLES.blocks, (row) => [
      row.createdAt,
      row.blocked.id,
    ]);
    return { items: page.items.map((row) => row.blocked), nextCursor: page.nextCursor };
  }

  /** E13. Blocking twice keeps the first block (and its place in the list). */
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new ApiProblem('cannot_block_self', 'You cannot block yourself.');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) {
      throw userNotFound();
    }
    await this.prisma.userBlock.createMany({
      data: [{ blockerId, blockedId, createdAt: this.clock.now() }],
      skipDuplicates: true,
    });
  }

  /** E14. Idempotent: unblocking someone not blocked (or unknown) is not an error. */
  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }
}
