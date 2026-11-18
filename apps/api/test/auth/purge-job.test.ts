import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../../src/auth/session.service.js';
import { parseEnv } from '../../src/config/env.js';
import { FixedClock } from '../../src/core/clock/fixed-clock.js';
import { PURGE_BATCH_SIZE, PurgeJob } from '../../src/core/jobs/purge.job.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestDatabase, type TestDatabase } from '../support/test-database.js';

const NOW = new Date('2026-11-18T10:00:00.000Z');

let database: TestDatabase;
let prisma: PrismaService;
let userId: string;
let job: PurgeJob;

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

async function addSession(name: string, expiresAt: Date, absoluteExpiresAt: Date): Promise<void> {
  await prisma.session.create({
    data: {
      tokenHash: hashToken(name),
      userId,
      createdAt: at(-1000),
      lastUsedAt: at(-1000),
      expiresAt,
      absoluteExpiresAt,
    },
  });
}

beforeAll(async () => {
  database = await createTestDatabase();
  prisma = new PrismaService(parseEnv({ ...process.env, DATABASE_URL: database.url }));
  const user = await prisma.user.create({
    data: { email: 'purge@example.com', passwordHash: 'unused', displayName: 'Purge' },
  });
  userId = user.id;
  job = new PurgeJob(prisma, new FixedClock(NOW));
});

afterAll(async () => {
  await prisma.$disconnect();
  await database.drop();
});

describe('PurgeJob', () => {
  it('deletes_expired_sessions_and_cache_rows_and_keeps_live_ones', async () => {
    await addSession('idle-expired', at(-1), at(1000));
    await addSession('expires-now', NOW, at(1000));
    await addSession('absolute-expired', at(1000), at(-1));
    await addSession('live', at(1), at(1000));
    await prisma.providerCache.createMany({
      data: [
        { key: 'expired', value: {}, expiresAt: at(-1) },
        { key: 'fresh', value: {}, expiresAt: at(1) },
      ],
    });

    const result = await job.run();

    expect(result).toEqual({ sessions: 3, providerCache: 1 });
    const sessions = await prisma.session.findMany({ select: { tokenHash: true } });
    expect(sessions.map((session) => Buffer.from(session.tokenHash))).toEqual([
      Buffer.from(hashToken('live')),
    ]);
    const cache = await prisma.providerCache.findMany({ select: { key: true } });
    expect(cache).toEqual([{ key: 'fresh' }]);
  });

  it('deletes_more_than_one_batch', async () => {
    const rows = PURGE_BATCH_SIZE * 2 + 1;
    await prisma.providerCache.createMany({
      data: Array.from({ length: rows }, (_, index) => ({
        key: `old-${index}`,
        value: { index },
        expiresAt: at(-index - 1),
      })),
    });

    const result = await job.run();

    expect(result.providerCache).toBe(rows);
    expect(await prisma.providerCache.count({ where: { key: { startsWith: 'old-' } } })).toBe(0);
  });

  it('finds_nothing_to_do_on_a_clean_database', async () => {
    const result = await job.run();

    expect(result).toEqual({ sessions: 0, providerCache: 0 });
  });
});
