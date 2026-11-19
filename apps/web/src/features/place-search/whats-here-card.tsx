'use client';

import { cleanText, LIMITS, type LngLat, type PlaceResult } from '@heremita/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { reversePlacesQuery } from '@/lib/api/query-keys';
import { Button } from '@/shared/components/button/button';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { IconButton } from '@/shared/components/icon-button/icon-button';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { TextField } from '@/shared/components/text-field/text-field';
import { MapPinPlus, X } from '@/shared/icons/icons';
import { geocodingFailure } from './geocoding-failure';
import { parseCoordinates } from './parse-coordinates';
import styles from './whats-here-card.module.css';

/** Decimals shown for a typed or tapped point (about 1 m). */
const POINT_DECIMALS = 5;

export interface CustomPlaceDraft {
  name: string;
  location: LngLat;
}

export interface WhatsHereCardProps {
  /** The draft pin: tapped, long-pressed, or the crosshair of "Add here". */
  point: LngLat;
  /** A nearby place was picked. */
  onPick: (place: PlaceResult) => void;
  /** "Use this exact spot" was confirmed with a name (cleaned, 1–200 characters). */
  onAddCustom: (place: CustomPlaceDraft) => void;
  /** Coordinates were typed in the disclosure: move the draft pin there. */
  onPointChange: (point: LngLat) => void;
  onClose: () => void;
  /** Names the destination of the custom spot, e.g. "Adicionar ao Dia 2". */
  addLabel: string;
  /** The custom spot is being added: its button waits. */
  adding?: boolean;
}

type NameError = 'required' | 'tooLong' | null;

/**
 * "What's here?" card for a point on the map: up to 5 named places within
 * 150 m (E43, nearest first), "Use this exact spot" with a required name for
 * a custom pin, and a "Coordinates" disclosure for typing `lat, lng`
 * instead of aiming.
 */
export function WhatsHereCard({
  point,
  onPick,
  onAddCustom,
  onPointChange,
  onClose,
  addLabel,
  adding = false,
}: WhatsHereCardProps) {
  const t = useTranslations('place-search.whatsHere');
  const tSearch = useTranslations('place-search.search');
  const tCommon = useTranslations('common.actions');
  const locale = useLocale();
  const headingId = useId();
  const nearby = useQuery(reversePlacesQuery({ ...point, locale }));

  const [customOpen, setCustomOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<NameError>(null);
  const [coordinates, setCoordinates] = useState('');
  const [coordinatesInvalid, setCoordinatesInvalid] = useState(false);

  function submitCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = cleanText(name);
    if (cleaned === '') {
      setNameError('required');
      return;
    }
    if (cleaned.length > LIMITS.PLACE_NAME_MAX) {
      setNameError('tooLong');
      return;
    }
    setNameError(null);
    onAddCustom({ name: cleaned, location: point });
  }

  function submitCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCoordinates(coordinates);
    setCoordinatesInvalid(parsed === null);
    if (parsed !== null) {
      onPointChange(parsed);
    }
  }

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div>
          <h2 id={headingId} className={styles.title} tabIndex={-1}>
            {t('title')}
          </h2>
          <p className={styles.point}>
            {t('point', {
              lat: point.lat.toFixed(POINT_DECIMALS),
              lng: point.lng.toFixed(POINT_DECIMALS),
            })}
          </p>
        </div>
        <IconButton label={tCommon('close')} icon={<X size={20} />} onClick={onClose} />
      </header>

      <div className={styles.region}>
        <h3 className={styles.subtitle}>{t('nearby')}</h3>
        {nearbyContent()}
      </div>

      {customOpen ? (
        <form className={styles.custom} noValidate onSubmit={submitCustom}>
          <TextField
            label={t('customName')}
            hint={t('customNameHint')}
            error={nameMessage()}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={LIMITS.PLACE_NAME_MAX}
            autoComplete="off"
            required
            // The field appears because the viewer asked for it: typing starts at once.
            autoFocus
          />
          <Button type="submit" variant="primary" block busy={adding}>
            {addLabel}
          </Button>
        </form>
      ) : (
        <Button block onClick={() => setCustomOpen(true)}>
          <MapPinPlus size={20} />
          {t('useExactPoint')}
        </Button>
      )}

      <details className={styles.coordinates}>
        <summary className={styles.summary}>{t('coordinates')}</summary>
        <form className={styles.coordinatesForm} noValidate onSubmit={submitCoordinates}>
          <TextField
            label={t('coordinatesLabel')}
            hint={t('coordinatesHint')}
            error={coordinatesInvalid ? t('coordinatesInvalid') : undefined}
            value={coordinates}
            onChange={(event) => setCoordinates(event.target.value)}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit">{t('coordinatesSubmit')}</Button>
        </form>
      </details>
    </section>
  );

  function nameMessage() {
    switch (nameError) {
      case 'required':
        return t('customNameRequired');
      case 'tooLong':
        return t('customNameTooLong', { max: LIMITS.PLACE_NAME_MAX });
      case null:
        return undefined;
    }
  }

  function nearbyContent() {
    if (nearby.isPending) {
      return (
        <Skeleton>
          <SkeletonBlock height="44px" />
          <SkeletonBlock height="44px" />
          <SkeletonBlock height="44px" />
        </Skeleton>
      );
    }
    if (nearby.isError) {
      const failure = geocodingFailure(nearby.error);
      return (
        <ErrorState
          headingLevel={3}
          title={t('failed')}
          message={failureMessage(failure.kind)}
          onRetry={() => void nearby.refetch()}
          code={failure.kind === 'unexpected' ? failure.code : undefined}
          requestId={failure.kind === 'unexpected' ? failure.requestId : undefined}
        />
      );
    }
    if (nearby.data.items.length === 0) {
      return <EmptyState headingLevel={3} title={t('empty')} />;
    }
    return (
      <ul className={styles.places} role="list">
        {nearby.data.items.map((place) => (
          <li key={place.key}>
            <button type="button" className={styles.place} onClick={() => onPick(place)}>
              <span className={styles.placeName}>{place.name}</span>
              <span className={styles.placeLabel}>{place.label}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  function failureMessage(kind: ReturnType<typeof geocodingFailure>['kind']) {
    switch (kind) {
      case 'busy':
        return tSearch('busy');
      case 'unavailable':
        return tSearch('unavailable');
      case 'offline':
        return tSearch('offline');
      case 'unexpected':
        return undefined;
    }
  }
}
