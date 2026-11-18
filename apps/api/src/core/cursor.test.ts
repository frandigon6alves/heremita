import { cursorSchema } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { CURSOR_TUPLES, decodeCursor, encodeCursor, toPage } from './cursor.js';
import { ApiProblem } from './http/api-problem.js';

const ID = '0193a000-0000-7000-8000-000000000101';
const AT = new Date('2026-11-18T10:00:00.123Z');

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof ApiProblem ? error.code : 'other';
  }
  return undefined;
}

describe('cursor codec', () => {
  it('round_trips_a_tuple_with_millisecond_dates', () => {
    const cursor = encodeCursor(CURSOR_TUPLES.myTrips, [AT, ID]);

    expect(decodeCursor(CURSOR_TUPLES.myTrips, cursor)).toEqual([AT, ID]);
  });

  it('round_trips_the_three_part_lowest_reviews_tuple', () => {
    const cursor = encodeCursor(CURSOR_TUPLES.lowestReviews, [2, AT, ID]);

    expect(decodeCursor(CURSOR_TUPLES.lowestReviews, cursor)).toEqual([2, AT, ID]);
  });

  it('issues_cursors_the_query_schema_accepts', () => {
    const cursor = encodeCursor(CURSOR_TUPLES.lowestReviews, [5, AT, ID]);

    expect(cursorSchema.safeParse(cursor).success).toBe(true);
  });

  it('reads_no_cursor_as_the_first_page', () => {
    expect(decodeCursor(CURSOR_TUPLES.reports, undefined)).toBeNull();
  });

  it.each([
    ['not base64 json', 'bm90LWpzb24'],
    ['wrong shape', Buffer.from('{"a":1}').toString('base64url')],
    ['wrong arity', Buffer.from(JSON.stringify([AT, ID, 1])).toString('base64url')],
    ['bad id', Buffer.from(JSON.stringify([AT, 'x'])).toString('base64url')],
    ['bad date', Buffer.from(JSON.stringify(['yesterday', ID])).toString('base64url')],
    ['empty', ''],
  ])('rejects_a_tampered_cursor_%s_with_invalid_cursor', (_label, cursor) => {
    expect(codeOf(() => decodeCursor(CURSOR_TUPLES.myTrips, cursor))).toBe('invalid_cursor');
  });

  it('rejects_a_cursor_issued_by_another_list', () => {
    const fromTrips = encodeCursor(CURSOR_TUPLES.myTrips, [AT, ID]);

    expect(codeOf(() => decodeCursor(CURSOR_TUPLES.lowestReviews, fromTrips))).toBe(
      'invalid_cursor',
    );
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3].map((n) => ({ id: ID.replace(/1$/, String(n)), at: new Date(n) }));
  const cursorOf = (row: { id: string; at: Date }) => [row.at, row.id] as [Date, string];

  it('ends_with_a_null_cursor_when_nothing_is_left', () => {
    expect(toPage([], 2, CURSOR_TUPLES.myTrips, cursorOf)).toEqual({ items: [], nextCursor: null });
    expect(toPage(rows.slice(0, 1), 2, CURSOR_TUPLES.myTrips, cursorOf).nextCursor).toBeNull();
    expect(toPage(rows.slice(0, 2), 2, CURSOR_TUPLES.myTrips, cursorOf).nextCursor).toBeNull();
  });

  it('points_after_the_last_returned_row_when_one_more_exists', () => {
    const page = toPage(rows, 2, CURSOR_TUPLES.myTrips, cursorOf);

    expect(page.items).toEqual(rows.slice(0, 2));
    expect(decodeCursor(CURSOR_TUPLES.myTrips, page.nextCursor ?? undefined)).toEqual([
      rows[1]?.at,
      rows[1]?.id,
    ]);
  });
});
