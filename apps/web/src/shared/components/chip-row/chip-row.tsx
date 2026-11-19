'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import styles from './chip-row.module.css';

export interface Chip<Id extends string> {
  id: Id;
  label: string;
  /** Colour dot before the label, a CSS colour such as `var(--day-2)`; the label still names it. */
  swatch?: string;
}

export interface ChipRowProps<Id extends string> {
  /** Names the group ("Dias"). */
  label: string;
  chips: readonly Chip<Id>[];
  selectedId: Id;
  onSelect: (id: Id) => void;
  /** Control after the last chip, e.g. the "+" new-day button. */
  trailing?: ReactNode;
}

/**
 * One-line row of toggle chips that scrolls sideways (day chips). The
 * selected chip is pressed and kept in view whenever the selection changes,
 * however it changed (tap, URL, Back).
 */
export function ChipRow<Id extends string>({
  label,
  chips,
  selectedId,
  onSelect,
  trailing,
}: ChipRowProps<Id>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    rowRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }, [selectedId, reducedMotion]);

  return (
    <div ref={rowRef} className={styles.row} role="group" aria-label={label}>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={styles.chip}
          aria-pressed={chip.id === selectedId}
          onClick={() => onSelect(chip.id)}
        >
          {chip.swatch ? (
            <span
              className={styles.swatch}
              style={{ backgroundColor: chip.swatch }}
              aria-hidden="true"
            />
          ) : null}
          {chip.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
