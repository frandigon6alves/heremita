'use client';

import type { TripOwner, Visibility } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { StatusLine, type SaveStatus } from '@/shared/components/status-line/status-line';
import { useOnline } from '@/shared/hooks/use-online';
import { useTripUpdate } from './use-trip-update';
import styles from './trip-settings.module.css';

const OPTIONS: readonly Visibility[] = ['private', 'link', 'public'];

/**
 * Who can open the trip: only me, anyone with the link (never listed), or
 * everyone (listed in Explore, dates hidden). Chosen first and saved with a
 * button, so arrowing through the radios never publishes the trip; one PATCH
 * with an inline status, a failure keeps the choice and explains itself.
 */
export function VisibilitySettings({ trip }: { trip: TripOwner }) {
  const t = useTranslations('trips.settings.visibility');
  const name = useId();
  const online = useOnline();
  const update = useTripUpdate(trip.id);
  const [chosen, setChosen] = useState<Visibility | null>(null);
  const shown = chosen ?? trip.visibility;

  function status(): SaveStatus {
    if (update.isPending) {
      return 'saving';
    }
    if (update.isError) {
      return 'error';
    }
    return update.isSuccess ? 'saved' : 'idle';
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shown !== trip.visibility) {
      update.mutate({ visibility: shown }, { onSuccess: () => setChosen(null) });
    }
  }

  return (
    <form className={styles.visibility} noValidate onSubmit={submit}>
      <fieldset className={styles.choices} disabled={!online || update.isPending}>
        {/* The status stays out of the legend: the group's name must not change as it saves. */}
        <legend className={styles.legend}>{t('legend')}</legend>
        <StatusLine status={status()} />
        {OPTIONS.map((option) => (
          <label key={option} className={styles.choice}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={shown === option}
              onChange={() => setChosen(option)}
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
      {update.isError ? <FormAlert error={update.error} message={t('failed')} /> : null}
      <div className={styles.buttons}>
        <Button type="submit" variant="primary" busy={update.isPending} disabled={!online}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
