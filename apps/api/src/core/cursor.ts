import { idSchema, timestampSchema, type Page } from '@heremita/shared';
import { z } from 'zod';
import { ApiProblem } from './http/api-problem.js';

const cursorTime = timestampSchema.transform((value) => new Date(value));

/**
 * Keyset position of each list (§I.api.mechanics "Cursor codec"): the sort key
 * of the last row of a page, tie-broken by id.
 */
export const CURSOR_TUPLES = {
  /** E18: `(updated_at DESC, id DESC)`. */
  myTrips: z.tuple([cursorTime, idSchema]),
  /** E48, E16: `(published_at DESC, id DESC)`. */
  publishedTrips: z.tuple([cursorTime, idSchema]),
  /** E45 `sort=recent`, E17: `(created_at DESC, id DESC)`. */
  recentReviews: z.tuple([cursorTime, idSchema]),
  /** E45 `sort=lowest`: `(rating ASC, created_at DESC, id DESC)`. */
  lowestReviews: z.tuple([z.int().min(1).max(5), cursorTime, idSchema]),
  /** E12: `(created_at, blocked_id)`. */
  blocks: z.tuple([cursorTime, idSchema]),
  /** E50: `(created_at ASC, id ASC)`. */
  reports: z.tuple([cursorTime, idSchema]),
} as const;

export type CursorTuple = (typeof CURSOR_TUPLES)[keyof typeof CURSOR_TUPLES];

/** What goes into a cursor: dates are written as ISO-8601 UTC strings. */
export type CursorValues<T extends CursorTuple> = {
  [K in keyof z.output<T>]: z.output<T>[K] extends Date ? Date : z.output<T>[K];
};

/** `base64url(JSON.stringify(tuple))`: opaque to clients, not a secret. */
export function encodeCursor<T extends CursorTuple>(_tuple: T, values: CursorValues<T>): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

function invalidCursor(): ApiProblem {
  return new ApiProblem('invalid_cursor', 'The cursor is not valid for this list.', {
    errors: [{ pointer: '/query/cursor', detail: 'Unknown or tampered cursor.' }],
  });
}

/**
 * Decodes a client cursor for one list: `null` for the first page, the typed
 * tuple otherwise, and 422 `invalid_cursor` for anything this list never issued.
 */
export function decodeCursor<T extends CursorTuple>(
  tuple: T,
  cursor: string | undefined,
): z.output<T> | null {
  if (cursor === undefined) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const parsed = tuple.safeParse(json);
  if (!parsed.success) {
    throw invalidCursor();
  }
  return parsed.data as z.output<T>;
}

/**
 * Turns `limit + 1` fetched rows into a page: the extra row only proves that
 * another page exists, and the cursor points after the last row returned.
 */
export function toPage<Row, T extends CursorTuple>(
  rows: readonly Row[],
  limit: number,
  tuple: T,
  cursorOf: (row: Row) => CursorValues<T>,
): Page<Row> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > limit && last !== undefined ? encodeCursor(tuple, cursorOf(last)) : null;
  return { items, nextCursor };
}
