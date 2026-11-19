import type { Prisma } from '../generated/prisma/client.js';

/**
 * Prisma `select` of a `UserCard` (author, owner, reporter, blocked user). It
 * holds exactly the card's fields, so a selected row is served as it is.
 */
export const USER_CARD_SELECT = {
  id: true,
  displayName: true,
  isDemo: true,
} as const satisfies Prisma.UserSelect;
