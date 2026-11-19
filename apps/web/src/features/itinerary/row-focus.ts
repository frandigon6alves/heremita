const ROW_ATTRIBUTE = 'data-row-id';
const DAY_CHIPS_ATTRIBUTE = 'data-day-chips';

/** Marks a row's name button as a focus target for `focusAfterLeaving`. */
export function rowFocusProps(rowId: string) {
  return { [ROW_ATTRIBUTE]: rowId };
}

/** Marks the day chips: the last resort when a list loses its only row. */
export const dayChipsProps = { [DAY_CHIPS_ATTRIBUTE]: '' };

/**
 * Call just before a row leaves `list` (moved to another day, removed,
 * deleted): focus goes to the next row's name, else the previous one, else
 * the selected day chip, so it never drops to the page body when the row
 * holding it unmounts.
 */
export function focusAfterLeaving(list: HTMLElement | null, rowId: string): void {
  const rows = Array.from(list?.querySelectorAll<HTMLElement>(`[${ROW_ATTRIBUTE}]`) ?? []);
  const index = rows.findIndex((row) => row.getAttribute(ROW_ATTRIBUTE) === rowId);
  if (index === -1) {
    return;
  }
  const target =
    rows[index + 1] ??
    rows[index - 1] ??
    document.querySelector<HTMLElement>(`[${DAY_CHIPS_ATTRIBUTE}] [aria-pressed="true"]`);
  target?.focus();
}
