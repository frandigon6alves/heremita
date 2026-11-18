/**
 * Fixed UUIDv7-shaped ids of the demo data, so every seed run upserts the same rows.
 * Layout of the last group: 4 hex digits for the table, 8 for the row number.
 */
const SEED_ID_PREFIX = '0193a000-0000-7000-8000-';

export const SEED_TABLE = {
  user: 1,
  place: 2,
  trip: 3,
  day: 4,
  tripPlace: 5,
  stop: 6,
  review: 7,
  report: 8,
} as const;

export function seedId(table: keyof typeof SEED_TABLE, row: number): string {
  const tableHex = SEED_TABLE[table].toString(16).padStart(4, '0');
  return `${SEED_ID_PREFIX}${tableHex}${row.toString(16).padStart(8, '0')}`;
}
