import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { CLOCK, type Clock } from '../../core/clock/clock.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CacheEntry {
  key: string;
  value: unknown;
  ttlMs: number;
}

/**
 * Postgres-backed cache of parsed, mapped provider successes (`provider_cache`).
 * Callers store only what a provider answered successfully: estimates and
 * errors never reach `set`, and `remember` stores nothing when the load throws.
 * Writes happen after the provider answered, never inside a transaction.
 */
@Injectable()
export class ProviderCacheService {
  private readonly loading = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The live value under `key`, or undefined when absent, expired or of another shape. */
  async get<T>(key: string, schema: z.ZodType<T>): Promise<T | undefined> {
    return (await this.getMany([key], schema)).get(key);
  }

  /** Live values for `keys` in one query; missing, expired or misshapen keys are absent. */
  async getMany<T>(keys: readonly string[], schema: z.ZodType<T>): Promise<Map<string, T>> {
    const found = new Map<string, T>();
    if (keys.length === 0) {
      return found;
    }
    const rows = await this.prisma.providerCache.findMany({
      where: { key: { in: [...new Set(keys)] }, expiresAt: { gt: this.clock.now() } },
      select: { key: true, value: true },
    });
    for (const row of rows) {
      const parsed = schema.safeParse(row.value);
      if (parsed.success) {
        found.set(row.key, parsed.data);
      }
    }
    return found;
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    await this.setMany([{ key, value, ttlMs }]);
  }

  /** Upserts every entry in one statement. */
  async setMany(entries: readonly CacheEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const now = this.clock.now().getTime();
    const rows = [...new Map(entries.map((entry) => [entry.key, entry])).values()].map(
      (entry) =>
        Prisma.sql`(${entry.key}, ${JSON.stringify(entry.value)}::jsonb, ${new Date(now + entry.ttlMs)})`,
    );
    await this.prisma.$executeRaw`
      INSERT INTO provider_cache (key, value, expires_at)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
  }

  /**
   * Cached value under `key`, or the result of `load` stored for `ttlMs(value)`.
   * Concurrent misses on one key share a single `load`. A throwing `load`
   * stores nothing, so failures are never cached.
   */
  async remember<T>(
    key: string,
    schema: z.ZodType<T>,
    load: () => Promise<T>,
    ttlMs: (value: T) => number,
  ): Promise<T> {
    const cached = await this.get(key, schema);
    if (cached !== undefined) {
      return cached;
    }
    const inFlight = this.loading.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
    const loaded = (async () => {
      const value = await load();
      await this.set(key, value, ttlMs(value));
      return value;
    })().finally(() => this.loading.delete(key));
    this.loading.set(key, loaded);
    return loaded;
  }
}
