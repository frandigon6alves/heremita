'use client';

import type { PlaceResult } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/shared/components/button/button';
import { IconButton } from '@/shared/components/icon-button/icon-button';
import { MapPinPlus, X } from '@/shared/icons/icons';
import styles from './place-card.module.css';

interface ResultCardProps {
  result: PlaceResult;
  /** "Adicionar ao Dia 2": names where it goes. */
  addLabel: string;
  adding: boolean;
  disabled: boolean;
  onAdd: () => void;
  onClose: () => void;
  autoFocus?: boolean;
  communitySlot?: ReactNode;
}

/** A search result not in the trip yet: what it is, and one button to add it. */
export function ResultCard({
  result,
  addLabel,
  adding,
  disabled,
  onAdd,
  onClose,
  autoFocus = false,
  communitySlot,
}: ResultCardProps) {
  const t = useTranslations('itinerary');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (autoFocus) {
      headingRef.current?.focus();
    }
  }, [autoFocus, result.key]);

  return (
    <article className={styles.card} aria-labelledby="result-card-heading">
      <header className={styles.header}>
        <IconButton label={t('card.close')} icon={<X size={20} />} onClick={onClose} />
        <div className={styles.titles}>
          <h3 id="result-card-heading" ref={headingRef} tabIndex={-1} className={styles.title}>
            {result.name}
          </h3>
          <p className={styles.detail}>
            {[t(`categories.${result.category}`), result.label].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>
      <Button
        variant="primary"
        size="large"
        block
        busy={adding}
        disabled={disabled}
        onClick={onAdd}
      >
        {adding ? null : <MapPinPlus size={20} />}
        {adding ? t('card.adding') : addLabel}
      </Button>
      {communitySlot}
    </article>
  );
}
