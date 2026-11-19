'use client';

import { useId, type ReactNode } from 'react';
import { VisuallyHidden } from '../visually-hidden/visually-hidden';
import styles from './segmented-control.module.css';

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  /** Decorative icon shown before the label. */
  icon?: ReactNode;
}

export interface SegmentedControlProps<V extends string> {
  /** Names the group ("Modo"). Visually hidden unless `showLegend`. */
  legend: string;
  showLegend?: boolean;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
}

/**
 * One choice out of a few, shown side by side (Walk / Bike / Drive). Native
 * radios underneath: Tab enters the group, arrows move and choose, the
 * checked segment is filled (not colour alone: it is also bold).
 */
export function SegmentedControl<V extends string>({
  legend,
  showLegend = false,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<V>) {
  const name = useId();

  return (
    <fieldset className={styles.group} disabled={disabled}>
      {showLegend ? (
        <legend className={styles.legend}>{legend}</legend>
      ) : (
        <legend>
          <VisuallyHidden>{legend}</VisuallyHidden>
        </legend>
      )}
      <div className={styles.segments}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
            <input
              type="radio"
              className={styles.input}
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.icon}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
