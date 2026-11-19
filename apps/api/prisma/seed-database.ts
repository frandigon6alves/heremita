import { z } from 'zod';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemo } from './seed/seed-demo.js';

export { GAZETTEER_KEYS } from '../src/providers/fake/gazetteer.js';
export { BARCELONA_TRIP_ID, LISBON_TRIP_ID, seedShareToken } from './seed/trips.js';
export { DEMO_USER, SEED_USERS } from './seed/users.js';

export const seedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEMO_PASSWORD: z.string().min(12).default('heremita-demo-2026'),
});

/** Thrown instead of writing demo accounts with a known password to a production database. */
export class SeedRefusedError extends Error {
  override readonly name = 'SeedRefusedError';
}

/**
 * Demo data for development, tests and e2e. Idempotent (`pnpm db:seed` can run any
 * number of times), deterministic and offline. Refuses NODE_ENV=production.
 */
export async function seedDatabase(
  prisma: PrismaClient,
  env: Record<string, string | undefined> = {},
): Promise<void> {
  const { NODE_ENV, DEMO_PASSWORD } = seedEnvSchema.parse(env);
  if (NODE_ENV === 'production') {
    throw new SeedRefusedError(
      'Refusing to seed demo data with NODE_ENV=production: the demo accounts share a known password.',
    );
  }
  await seedDemo(prisma, DEMO_PASSWORD);
}
