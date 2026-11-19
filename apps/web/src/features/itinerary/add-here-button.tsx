'use client';

import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';
import { MapPinPlus } from '@/shared/icons/icons';
import type { OpenSource } from './stop-row';
import styles from './add-here-button.module.css';

interface AddHereButtonProps {
  pressed: boolean;
  disabled: boolean;
  onPress: (source: OpenSource) => void;
}

/** Floating "Adicionar aqui": the visible twin of the map long-press (V55). */
export function AddHereButton({ pressed, disabled, onPress }: AddHereButtonProps) {
  const t = useTranslations('itinerary.addHere');

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onPress(event.detail === 0 ? 'keyboard' : 'pointer');
  }

  return (
    <button
      type="button"
      className={styles.fab}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={handleClick}
    >
      <MapPinPlus size={24} />
      <span className={styles.label}>{t('button')}</span>
    </button>
  );
}
