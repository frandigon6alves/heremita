import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDatabase } from './seed-database.js';

// Entry point of `pnpm db:seed` (`prisma db seed`). prisma7.config.ts loads
// apps/api/.env and the Prisma CLI passes its environment on to this script.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Run `pnpm env:init` or set it in the environment.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await seedDatabase(prisma, process.env);
  process.stdout.write('Seed finished.\n');
} finally {
  await prisma.$disconnect();
}
