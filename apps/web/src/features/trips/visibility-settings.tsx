'use client';

import type { TripOwner, Visibility } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { StatusLine, type SaveStatus } from '@/shared/components/status-line/status-line';
import { showToast } from '@/shared/components/toast/toast-store';
import { useOnline } from '@/shared/hooks/use-online';
import { useTripUpdate } from './use-trip-update';
import styles from './trip-settings.module.css';

const OPTIONS: readonly Visibility[] = ['private', 'link', 'public'];

/**
 * Who can open the trip: only me, anyone with the link (never listed), or
 * everyone (listed in Explore, dates hidden). One PATCH per choice, with an
 * inline status; a failure keeps the saved choice and offers Retry.
 */
export function VisibilitySettings({ trip }: { trip: TripOwner }) {
  const t = useTranslations('trips.settings.visibility');
  const tActions = useTranslations('common.actions');
  const name = useId();
  const online = useOnline();
  const update = useTripUpdate(trip.id);
  const shown = update.isPending
    ? (update.variables.visibility ?? trip.visibility)
    : trip.visibility;

  function status(): SaveStatus {
    if (update.isPending) {
      return 'saving';
    }
    if (update.isError) {
      return 'error';
    }
    return update.isSuccess ? 'saved' : 'idle';
  }

  function choose(visibility: Visibility) {
    update.mutate(
      { visibility },
      {
        onError: () =>
          showToast({
            message: t('failed'),
            action: { label: tActions('retry'), onAction: () => choose(visibility) },
          }),
      },
    );
  }

  return (
    <fieldset className={styles.choices} disabled={!online || update.isPending}>
      <legend className={styles.legend}>
        {t('legend')} <StatusLine status={status()} />
      </legend>
      {OPTIONS.map((option) => (
        <label key={option} className={styles.choice}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={shown === option}
            onChange={() => choose(option)}
            aria-describedby={`${name}-${option}`}
          />
          <span className={styles.choiceText}>
            <span className={styles.choiceLabel}>{t(`${option}.label`)}</span>
            <span id={`${name}-${option}`} className={styles.choiceHint}>
              {t(`${option}.hint`)}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
