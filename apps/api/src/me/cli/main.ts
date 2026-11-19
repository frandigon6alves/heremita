import { PrismaPg } from '@prisma/adapter-pg';
import { SystemClock } from '../../core/clock/system-clock.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { resetPassword, ResetPasswordError } from './reset-password.js';

// Owner CLI: `pnpm --filter @heremita/api cli reset-password <email>`.
const USAGE = 'Usage: cli reset-password <email>\n';
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const [command, email, ...extra] = process.argv.slice(2);
const connectionString = process.env.DATABASE_URL;

if (command !== 'reset-password' || email === undefined || extra.length > 0) {
  process.stderr.write(USAGE);
  process.exit(EXIT_USAGE);
}
if (!connectionString) {
  process.stderr.write(
    'DATABASE_URL is not set. Run `pnpm env:init` or set it in the environment.\n',
  );
  process.exit(EXIT_USAGE);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const password = await resetPassword(prisma, new SystemClock(), email);
  process.stdout.write(
    `Temporary password: ${password}\n` +
      'It is shown only now. Every session of this user was signed out;\n' +
      'ask them to sign in with it and choose a new password in Settings.\n',
  );
} catch (error) {
  if (!(error instanceof ResetPasswordError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = EXIT_REFUSED;
} finally {
  await prisma.$disconnect();
}
