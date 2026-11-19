'use client';

import { useId, type FocusEventHandler, type ReactNode } from 'react';
import { Star } from '@/shared/icons/icons';
import styles from './rating-input.module.css';

const VALUES = [1, 2, 3, 4, 5] as const;

export interface RatingInputProps {
  legend: ReactNode;
  /** Accessible name of each option ("4 estrelas"). */
  optionLabel: (value: number) => string;
  value: number | null;
  onChange: (value: number) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  hint?: ReactNode;
  error?: ReactNode;
  name?: string;
  disabled?: boolean;
}

/**
 * Star rating 1–5 as a native radio group: five 44 px stars, Tab enters,
 * arrows change the rating, tap picks. Stars up to the value are filled and
 * the chosen one gets a ring, so colour is not the only cue. Errors per L11.
 */
export function RatingInput({
  legend,
  optionLabel,
  value,
  onChange,
  onBlur,
  hint,
  error,
  name,
  disabled = false,
}: RatingInputProps) {
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const legendId = `${baseId}-legend`;
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const describedBy =
    [hint ? hintId : undefined, hasError ? errorId : undefined].filter(Boolean).join(' ') ||
    undefined;

  return (
    <fieldset
      className={styles.group}
      disabled={disabled}
      role="radiogroup"
      aria-labelledby={legendId}
      aria-describedby={describedBy}
      aria-invalid={hasError ? true : undefined}
    >
      <legend id={legendId} className={styles.legend}>
        {legend}
      </legend>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      <div className={styles.stars}>
        {VALUES.map((option) => (
          <label
            key={option}
            className={
              value !== null && option <= value ? `${styles.star} ${styles.filled}` : styles.star
            }
          >
            <input
              type="radio"
              className={styles.input}
              name={name ?? baseId}
              value={option}
              checked={value === option}
              aria-label={optionLabel(option)}
              onChange={() => onChange(option)}
              onBlur={onBlur}
            />
            <Star className={styles.icon} />
          </label>
        ))}
      </div>
      {hasError ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
