import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../clock/clock.js';

export const PURGE_INTERVAL_MS = 60 * 60 * 1000;
/** Rows deleted per statement, so one purge never holds long locks. */
export const PURGE_BATCH_SIZE = 1_000;

export interface PurgeResult {
  sessions: number;
  providerCache: number;
}

/**
 * Hourly cleanup of rows nobody can use any more: expired sessions and expired
 * provider cache entries. Runs in-process on a timer (single API instance, see
 * §C); a failed run is logged and retried on the next tick.
 */
@Injectable()
export class PurgeJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PurgeJob.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.runSafely(), PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async run(): Promise<PurgeResult> {
    const now = this.clock.now();
    const sessions = await this.inBatches(
      () => this.prisma.$executeRaw`
        DELETE FROM sessions WHERE id IN (
          SELECT id FROM sessions
          WHERE expires_at <= ${now} OR absolute_expires_at <= ${now}
          LIMIT ${PURGE_BATCH_SIZE}
        )`,
    );
    const providerCache = await this.inBatches(
      () => this.prisma.$executeRaw`
        DELETE FROM provider_cache WHERE key IN (
          SELECT key FROM provider_cache WHERE expires_at <= ${now} LIMIT ${PURGE_BATCH_SIZE}
        )`,
    );
    return { sessions, providerCache };
  }

  private async inBatches(deleteBatch: () => Promise<number>): Promise<number> {
    let total = 0;
    let deleted: number;
    do {
      deleted = await deleteBatch();
      total += deleted;
    } while (deleted === PURGE_BATCH_SIZE);
    return total;
  }

  private async runSafely(): Promise<void> {
    try {
      const result = await this.run();
      this.logger.log(
        `Purged ${result.sessions} expired sessions, ${result.providerCache} provider cache rows`,
      );
    } catch (error) {
      this.logger.error(
        `Purge failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
