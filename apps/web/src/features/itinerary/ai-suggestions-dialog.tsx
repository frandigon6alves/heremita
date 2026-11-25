'use client';

import type { PlaceResult, PlaceSuggestions, TripPlanOwner } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { useMutation, useMutationState } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api/client';
import { hasCode } from '@/lib/api/failure';
import { Button } from '@/shared/components/button/button';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { TextArea } from '@/shared/components/text-area/text-area';
import { announce } from '@/shared/components/toast/toast-store';
import { Check, MapPin, Plus } from '@/shared/icons/icons';
import styles from './ai-suggestions.module.css';

const PROMPT_MIN = 3;

function isSuggestions(data: unknown): data is PlaceSuggestions {
  return typeof data === 'object' && data !== null && 'items' in data && 'dropped' in data;
}

/**
 * Not under `planMutationKey(tripId)`: the "Saving…" indicator matches that
 * prefix, and asking the AI saves nothing.
 */
export function suggestMutationKey(tripId: string) {
  return ['ai-suggestions', tripId] as const;
}

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

interface SuggestionItemProps {
  place: PlaceResult;
  reason: string;
  added: boolean;
  disabled: boolean;
  onAdd: () => void;
  onShowOnMap: () => void;
}

/**
 * One suggestion. The buttons keep their visible label as their accessible
 * name (WCAG 2.5.3, so voice control users can say it) and take the place's
 * name as their description.
 */
function SuggestionItem({
  place,
  reason,
  added,
  disabled,
  onAdd,
  onShowOnMap,
}: SuggestionItemProps) {
  const t = useTranslations('itinerary.ai');
  const nameId = useId();
  return (
    <li className={styles.item}>
      <div className={styles.text}>
        <h3 id={nameId} className={styles.name}>
          {place.name}
        </h3>
        <p className={styles.label}>{place.label}</p>
        <p className={styles.reason}>{reason}</p>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" aria-describedby={nameId} onClick={onShowOnMap}>
          <MapPin size={20} />
          {t('showOnMap')}
        </Button>
        {added ? (
          <span className={styles.added}>
            <Check size={20} />
            {t('added')}
          </span>
        ) : (
          <Button aria-describedby={nameId} disabled={disabled} onClick={onAdd}>
            <Plus size={20} />
            {t('add')}
          </Button>
        )}
      </div>
    </li>
  );
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
  const mutationKey = suggestMutationKey(tripId);
  // The planner unmounts this panel while a place card is open ("Show on map"):
  // the last answer, kept in the mutation cache, is shown again when it comes back.
  const [previous] = useMutationState<{ prompt: string; data: PlaceSuggestions } | null>({
    filters: { mutationKey, status: 'success' },
    select: ({ state }) => {
      const { variables, data } = state;
      return typeof variables === 'string' && isSuggestions(data)
        ? { prompt: variables, data }
        : null;
    },
  })
    .filter((entry) => entry !== null)
    .slice(-1);
  const [prompt, setPrompt] = useState(previous?.prompt ?? '');
  const [promptError, setPromptError] = useState(false);
  const suggest = useMutation({
    mutationKey,
    mutationFn: (text: string): Promise<PlaceSuggestions> =>
      apiFetch(apiRoutes.suggestPlaces, {
        params: { tripId },
        body: { prompt: text, locale, count: LIMITS.SUGGEST_COUNT.default },
      }),
    onSuccess: ({ items }) => announce(t('found', { count: items.length })),
    onError: () => announce(t('failed')),
  });
  const answer = suggest.data ?? (suggest.isIdle ? previous?.data : undefined);
  const inTrip = new Set(plan.places.flatMap((entry) => entry.place.key ?? []));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (text.length < PROMPT_MIN) {
      setPromptError(true);
      return;
    }
    setPromptError(false);
    if (!suggest.isPending) {
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
      const retry = suggest.variables;
      return (
        <ErrorState
          headingLevel={3}
          title={t('failed')}
          message={known ? t(`errors.${known.key}`) : undefined}
          onRetry={
            (known && !known.retry) || retry === undefined ? undefined : () => suggest.mutate(retry)
          }
          error={suggest.error}
        />
      );
    }
    if (!answer) {
      return <p className={styles.hint}>{t('examples')}</p>;
    }
    return (
      <>
        {answer.items.length === 0 ? (
          <p className={styles.hint}>{t('empty')}</p>
        ) : (
          <ul className={styles.list} aria-label={t('resultsLabel')}>
            {answer.items.map(({ place, reason }) => (
              <SuggestionItem
                key={place.key}
                place={place}
                reason={reason}
                added={inTrip.has(place.key)}
                disabled={disabled}
                onAdd={() => onAdd(place)}
                onShowOnMap={() => onShowOnMap(place)}
              />
            ))}
          </ul>
        )}
        {answer.dropped > 0 ? (
          <p className={styles.hint}>{t('dropped', { count: answer.dropped })}</p>
        ) : null}
      </>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('title')}>
      {/* noValidate: the hint below speaks the app's language, not the browser's. */}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextArea
          label={t('promptLabel')}
          hint={t('disclaimer')}
          error={promptError ? t('promptTooShort') : undefined}
          rows={3}
          value={prompt}
          maxLength={LIMITS.SUGGEST_PROMPT_MAX}
          onChange={(event) => {
            setPrompt(event.target.value);
            if (promptError && event.target.value.trim().length >= PROMPT_MIN) {
              setPromptError(false);
            }
          }}
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
      {/* Outcomes are announced in one sentence (announce), not by reading the whole list. */}
      <div className={styles.result}>{body()}</div>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
