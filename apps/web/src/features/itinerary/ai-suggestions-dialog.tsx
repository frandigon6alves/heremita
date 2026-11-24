'use client';

import type { PlaceResult, PlaceSuggestions, TripPlanOwner } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api/client';
import { hasCode } from '@/lib/api/failure';
import { Button } from '@/shared/components/button/button';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { TextArea } from '@/shared/components/text-area/text-area';
import { Check, MapPin, Plus } from '@/shared/icons/icons';
import styles from './ai-suggestions.module.css';

interface AiSuggestionsDialogProps {
  tripId: string;
  plan: TripPlanOwner;
  disabled: boolean;
  open: boolean;
  onClose: () => void;
  onAdd: (place: PlaceResult) => void;
  onShowOnMap: (place: PlaceResult) => void;
}

type FailureKey = 'destination' | 'quota' | 'rateLimited' | 'unavailable' | 'geocoding';

/** Codes the owner can act on, and whether trying again can help. */
function failure(error: unknown): { key: FailureKey; retry: boolean } | null {
  if (hasCode(error, 'destination_required')) {
    return { key: 'destination', retry: false };
  }
  if (hasCode(error, 'ai_quota_exhausted')) {
    return { key: 'quota', retry: false };
  }
  if (hasCode(error, 'rate_limited')) {
    return { key: 'rateLimited', retry: false };
  }
  if (hasCode(error, 'ai_unavailable')) {
    return { key: 'unavailable', retry: true };
  }
  if (hasCode(error, 'geocoding_unavailable') || hasCode(error, 'geocoding_busy')) {
    return { key: 'geocoding', retry: true };
  }
  return null;
}

/**
 * The owner describes what they want; the API answers real places near the
 * trip (each one found on OpenStreetMap, V77) with the AI's reason. Nothing
 * is saved until the owner adds a place, which lands in Ideas (E29).
 */
export function AiSuggestionsDialog({
  tripId,
  plan,
  disabled,
  open,
  onClose,
  onAdd,
  onShowOnMap,
}: AiSuggestionsDialogProps) {
  const t = useTranslations('itinerary.ai');
  const locale = useLocale();
  const [prompt, setPrompt] = useState('');
  const suggest = useMutation({
    mutationFn: (text: string): Promise<PlaceSuggestions> =>
      apiFetch(apiRoutes.suggestPlaces, {
        params: { tripId },
        body: { prompt: text, locale, count: LIMITS.SUGGEST_COUNT.default },
      }),
  });
  const inTrip = new Set(plan.places.flatMap((entry) => entry.place.key ?? []));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (text.length >= 3 && !suggest.isPending) {
      suggest.mutate(text);
    }
  }

  function body() {
    if (suggest.isPending) {
      return (
        <Skeleton label={t('loading')}>
          {[0, 1, 2].map((key) => (
            <SkeletonBlock key={key} shape="text" />
          ))}
        </Skeleton>
      );
    }
    if (suggest.isError) {
      const known = failure(suggest.error);
      return (
        <ErrorState
          headingLevel={3}
          title={t('failed')}
          message={known ? t(`errors.${known.key}`) : undefined}
          onRetry={known && !known.retry ? undefined : () => suggest.mutate(suggest.variables)}
          error={suggest.error}
        />
      );
    }
    if (!suggest.data) {
      return <p className={styles.hint}>{t('examples')}</p>;
    }
    const { items, dropped } = suggest.data;
    return (
      <>
        {items.length === 0 ? (
          <p className={styles.hint}>{t('empty')}</p>
        ) : (
          <ul className={styles.list} aria-label={t('resultsLabel')}>
            {items.map(({ place, reason }) => {
              const added = inTrip.has(place.key);
              return (
                <li key={place.key} className={styles.item}>
                  <div className={styles.text}>
                    <h3 className={styles.name}>{place.name}</h3>
                    <p className={styles.label}>{place.label}</p>
                    <p className={styles.reason}>{reason}</p>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      aria-label={t('showOnMapNamed', { name: place.name })}
                      onClick={() => onShowOnMap(place)}
                    >
                      <MapPin size={20} />
                      {t('showOnMap')}
                    </Button>
                    {added ? (
                      <span className={styles.added}>
                        <Check size={20} />
                        {t('added')}
                      </span>
                    ) : (
                      <Button
                        aria-label={t('addNamed', { name: place.name })}
                        disabled={disabled}
                        onClick={() => onAdd(place)}
                      >
                        <Plus size={20} />
                        {t('add')}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {dropped > 0 ? <p className={styles.hint}>{t('dropped', { count: dropped })}</p> : null}
      </>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('title')}>
      <form className={styles.form} onSubmit={submit}>
        <TextArea
          label={t('promptLabel')}
          hint={t('disclaimer')}
          rows={3}
          value={prompt}
          minLength={3}
          maxLength={LIMITS.SUGGEST_PROMPT_MAX}
          required
          onChange={(event) => setPrompt(event.target.value)}
          {...initialFocus}
        />
        <Button
          type="submit"
          variant="primary"
          busy={suggest.isPending}
          disabled={disabled}
          className={styles.submit}
        >
          {suggest.isPending ? t('submitting') : t('submit')}
        </Button>
      </form>
      <div className={styles.result} aria-live="polite">
        {body()}
      </div>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
