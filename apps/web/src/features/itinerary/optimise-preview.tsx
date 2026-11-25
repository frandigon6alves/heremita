'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { hasCode } from '@/lib/api/failure';
import { orderSuggestionQuery } from '@/lib/api/query-keys';
import { formatDuration } from '@/lib/format/duration';
import { Button } from '@/shared/components/button/button';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { announce } from '@/shared/components/toast/toast-store';
import { findDay, findPlace, type PlanLike } from './plan-view';
import styles from './optimise-preview.module.css';

interface OptimisePreviewProps {
  tripId: string;
  plan: PlanLike & { planVersion: number };
  dayId: string;
  open: boolean;
  onClose: () => void;
  /** Applies the suggested order; `previous` is the order shown when it was suggested (Undo). */
  onApply: (stopIds: readonly string[], previous: readonly string[]) => void;
  disabled?: boolean;
}

/**
 * "Otimizar ordem": the shorter visiting order the API suggests for a day
 * (E41, nothing written), before/after time and the new numbered order with
 * each place's old number, then Apply (E36). The first stop never moves;
 * "Keep the last place" is on by default.
 */
export function OptimisePreview({
  tripId,
  plan,
  dayId,
  open,
  onClose,
  onApply,
  disabled = false,
}: OptimisePreviewProps) {
  const t = useTranslations('itinerary.optimise');
  const locale = useLocale();
  const keepLastId = useId();
  const [keepLast, setKeepLast] = useState(true);
  const suggestion = useQuery({
    ...orderSuggestionQuery(tripId, dayId, plan.planVersion, keepLast),
    enabled: open,
  });
  const day = findDay(plan, dayId);
  const current = day?.stops.map((stop) => stop.id) ?? [];
  const unchanged = suggestion.data?.stopIds.every((id, i) => id === current[i]) ?? false;

  /** The outcome in one sentence: shown, and read out once (not the whole new order). */
  function verdictText(): string | null {
    if (suggestion.isError) {
      return t('failed');
    }
    if (!suggestion.data) {
      return null;
    }
    if (unchanged) {
      return t('alreadyShortest');
    }
    const { before, after, estimated } = suggestion.data;
    const comparison = t('comparison', {
      before: formatDuration(before.durationSeconds, locale),
      after: formatDuration(after.durationSeconds, locale),
    });
    return estimated ? `${comparison} ${t('estimated')}` : comparison;
  }
  const verdict = verdictText();

  // Syncs with the app's single live region (V61), an external store.
  useEffect(() => {
    if (open && verdict !== null) {
      announce(verdict);
    }
  }, [open, verdict]);

  function body() {
    if (suggestion.isPending) {
      return (
        <Skeleton label={t('loading')}>
          <SkeletonBlock shape="text" width="60%" />
          {current.map((id) => (
            <SkeletonBlock key={id} shape="text" />
          ))}
        </Skeleton>
      );
    }
    if (suggestion.isError) {
      const tooFew = hasCode(suggestion.error, 'too_few_stops');
      return (
        <ErrorState
          headingLevel={3}
          title={t('failed')}
          message={tooFew ? t('tooFew') : undefined}
          onRetry={tooFew ? undefined : () => void suggestion.refetch()}
          error={suggestion.error}
        />
      );
    }
    const { stopIds } = suggestion.data;
    if (unchanged) {
      return <p className={styles.verdict}>{verdict}</p>;
    }
    return (
      <>
        <p className={styles.verdict}>{verdict}</p>
        <ol className={styles.order} aria-label={t('newOrder')}>
          {stopIds.map((stopId, index) => {
            const stop = day?.stops.find((candidate) => candidate.id === stopId);
            const name = (stop && findPlace(plan, stop.tripPlaceId)?.place.name) ?? '';
            const was = current.indexOf(stopId) + 1;
            return (
              <li key={stopId} className={styles.item}>
                <span className={styles.number} aria-hidden="true">
                  {index + 1}
                </span>
                <span>{name}</span>
                {was !== index + 1 ? (
                  <span className={styles.was}>{t('was', { number: was })}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </>
    );
  }

  const canApply =
    suggestion.isSuccess && !suggestion.data.stopIds.every((id, i) => id === current[i]);

  return (
    <Dialog open={open} onClose={onClose} title={t('title', { number: day?.number ?? 0 })}>
      <p className={styles.hint}>{t('firstFixed')}</p>
      <label className={styles.toggle} htmlFor={keepLastId}>
        <input
          id={keepLastId}
          type="checkbox"
          checked={keepLast}
          onChange={(event) => setKeepLast(event.target.checked)}
        />
        <span>{t('keepLast')}</span>
      </label>
      <div className={styles.result}>{body()}</div>
      <DialogActions>
        <Button onClick={onClose} {...initialFocus}>
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={!canApply || disabled}
          onClick={() => {
            if (suggestion.data) {
              onApply(suggestion.data.stopIds, current);
            }
          }}
        >
          {t('apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
