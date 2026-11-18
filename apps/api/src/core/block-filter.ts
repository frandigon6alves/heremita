import { Prisma } from '../generated/prisma/client.js';

/**
 * Hides authors the viewer blocked (§I.api.mechanics "Block filter"), for raw
 * SQL: appends `AND <author column> NOT IN (blocked by viewer)`, or nothing for
 * an anonymous viewer. `authorColumn` must be a trusted identifier such as
 * `Prisma.raw('r.author_id')`, never user input.
 */
export function andAuthorNotBlockedBy(
  viewerId: string | null,
  authorColumn: Prisma.Sql,
): Prisma.Sql {
  if (viewerId === null) {
    return Prisma.empty;
  }
  return Prisma.sql`AND ${authorColumn} NOT IN (SELECT ub.blocked_id FROM user_blocks ub WHERE ub.blocker_id = ${viewerId}::uuid)`;
}

/**
 * The same filter for Prisma queries, as a condition on the author relation:
 * `where: { author: userNotBlockedBy(viewerId) }` (reviews) or
 * `where: { owner: userNotBlockedBy(viewerId) }` (trips).
 */
export function userNotBlockedBy(viewerId: string | null): Prisma.UserWhereInput {
  return viewerId === null ? {} : { blockedBy: { none: { blockerId: viewerId } } };
}
