'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ApiProblemError, HttpError } from '@/lib/api/problem';
import { orderSuggestionQuery } from '@/lib/api/query-keys';
import { formatDuration } from '@/lib/format/duration';
import { Button } from '@/shared/components/button/button';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
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

function failureOf(error: unknown) {
  if (error instanceof ApiProblemError) {
    return { code: error.code, requestId: error.requestId ?? undefined };
  }
  if (error instanceof HttpError) {
    return { code: undefined, requestId: error.requestId ?? undefined };
  }
  return { code: undefined, requestId: undefined };
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
      const failure = failureOf(suggestion.error);
      return (
        <ErrorState
          headingLevel={3}
          title={t('failed')}
          message={failure.code === 'too_few_stops' ? t('tooFew') : undefined}
          onRetry={failure.code === 'too_few_stops' ? undefined : () => void suggestion.refetch()}
          code={failure.code}
          requestId={failure.requestId}
        />
      );
    }
    const { before, after, stopIds, estimated } = suggestion.data;
    const unchanged = stopIds.every((id, i) => id === current[i]);
    if (unchanged) {
      return <p className={styles.verdict}>{t('alreadyShortest')}</p>;
    }
    return (
      <>
        <p className={styles.verdict}>
          {t('comparison', {
            before: formatDuration(before.durationSeconds, locale),
            after: formatDuration(after.durationSeconds, locale),
          })}
          {estimated ? ` ${t('estimated')}` : null}
        </p>
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
      <div className={styles.result} aria-live="polite">
        {body()}
      </div>
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
