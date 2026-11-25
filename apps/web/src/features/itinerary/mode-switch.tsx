'use client';

import type { TravelMode } from '@heremita/shared';
import { TRAVEL_MODES } from '@heremita/shared/plain';
import { useTranslations } from 'next-intl';
import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { ModeIcon } from '@/shared/components/mode-icon/mode-icon';
import styles from './mode-switch.module.css';

interface ModeSwitchProps {
  value: TravelMode;
  /** Applies a mode (the planner saves it): a click or tap, Enter or Space; never an arrow key. */
  onChange: (mode: TravelMode) => void;
  disabled?: boolean;
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * Walk / Bike / Drive for the selected day's route. Arrow keys move the
 * choice without applying it (native radios check as they move, and each
 * applied mode is saved and refetches the route); Enter or Space applies the
 * one under focus, a click applies at once, and leaving the group forgets
 * an unapplied one (WCAG 3.2.2).
 */
export function ModeSwitch({ value, onChange, disabled }: ModeSwitchProps) {
  const t = useTranslations('itinerary.route.mode');
  const [pending, setPending] = useState<TravelMode | null>(null);
  const arrowKey = useRef(false);

  function apply(mode: TravelMode) {
    setPending(null);
    if (mode !== value) {
      onChange(mode);
    }
  }

  function handleChange(mode: TravelMode) {
    // The browser checks the next radio as the default action of an arrow keydown.
    if (arrowKey.current) {
      arrowKey.current = false;
      setPending(mode);
      return;
    }
    apply(mode);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    arrowKey.current = ARROWS.has(event.key);
    if ((event.key === 'Enter' || event.key === ' ') && pending !== null) {
      event.preventDefault();
      apply(pending);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setPending(null);
    }
  }

  return (
    <div
      className={styles.modeSwitch}
      onKeyDown={handleKeyDown}
      onPointerDown={() => {
        arrowKey.current = false;
      }}
      onBlur={handleBlur}
    >
      <SegmentedControl
        legend={t('legend')}
        description={t('applyHint')}
        value={pending ?? value}
        onChange={handleChange}
        disabled={disabled}
        options={TRAVEL_MODES.map((mode) => ({
          value: mode,
          label: t(mode),
          icon: <ModeIcon mode={mode} />,
        }))}
      />
    </div>
  );
}
