import { Prisma } from '../generated/prisma/client.js';

interface DriverAdapterMeta {
  driverAdapterError?: { cause?: { constraint?: { index?: string } } };
}

/**
 * Name of the unique index a write violated (`users_email_key`), or undefined
 * when the error is anything else. With the pg driver adapter Prisma reports
 * it under `meta.driverAdapterError.cause.constraint.index`.
 */
export function violatedUniqueIndex(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return undefined;
  }
  return (error.meta as DriverAdapterMeta | undefined)?.driverAdapterError?.cause?.constraint
    ?.index;
}
