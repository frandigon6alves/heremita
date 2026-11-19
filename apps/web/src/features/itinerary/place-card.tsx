'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/shared/components/button/button';
import { IconButton } from '@/shared/components/icon-button/icon-button';
import { ChevronLeft, Trash } from '@/shared/icons/icons';
import { DayAssign } from './day-assign';
import { NoteEditor } from './note-editor';
import type { PlanEditor } from './plan-editor';
import { findPlace, isPendingId, type PlanLike } from './plan-view';
import { usePlaceDetail } from './use-place-detail';
import styles from './place-card.module.css';

export interface PlaceCardOwner {
  tripId: string;
  note: string | null;
  editor: PlanEditor;
}

interface PlaceCardProps {
  plan: PlanLike;
  tripPlaceId: string;
  /** Back to the list (deselects). */
  onBack: () => void;
  /** Opened from the keyboard: focus lands on the heading. */
  autoFocus?: boolean;
  /** Community content composed by the page (rating, reviews link): this feature never imports reviews. */
  communitySlot?: ReactNode;
  /** The owner's note, day choice and delete; absent on read-only pages. */
  owner?: PlaceCardOwner;
}

/** A trip place in trip context: name, day, private note, what others say. */
export function PlaceCard({
  plan,
  tripPlaceId,
  onBack,
  autoFocus = false,
  communitySlot,
  owner,
}: PlaceCardProps) {
  const t = useTranslations('itinerary.card');
  const detailOf = usePlaceDetail();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const entry = findPlace(plan, tripPlaceId);

  useEffect(() => {
    if (autoFocus) {
      headingRef.current?.focus();
    }
  }, [autoFocus, tripPlaceId]);

  if (!entry) {
    return null;
  }
  const { place } = entry;
  const pending = isPendingId(tripPlaceId);
  const disabled = !owner || owner.editor.disabled || pending;

  return (
    <article
      className={styles.card}
      aria-labelledby="place-card-heading"
      aria-busy={pending || undefined}
    >
      <header className={styles.header}>
        <IconButton label={t('back')} icon={<ChevronLeft size={20} />} onClick={onBack} />
        <div className={styles.titles}>
          <h3 id="place-card-heading" ref={headingRef} tabIndex={-1} className={styles.title}>
            {place.name}
          </h3>
          <p className={styles.detail}>{detailOf(place)}</p>
        </div>
      </header>
      {owner ? (
        <DayAssign
          plan={plan}
          tripPlaceId={tripPlaceId}
          name={place.name}
          editor={owner.editor}
          disabled={disabled}
        />
      ) : null}
      {owner && !pending ? (
        <NoteEditor
          key={tripPlaceId}
          tripId={owner.tripId}
          tripPlaceId={tripPlaceId}
          note={owner.note}
          disabled={owner.editor.disabled}
        />
      ) : null}
      {communitySlot ? (
        <section className={styles.community} aria-labelledby="place-card-community">
          <h4 id="place-card-community" className={styles.sectionTitle}>
            {t('community')}
          </h4>
          {communitySlot}
        </section>
      ) : null}
      {owner ? (
        <Button
          variant="ghost"
          className={styles.delete}
          disabled={disabled}
          onClick={() => owner.editor.actions.deleteFromTrip(tripPlaceId)}
        >
          <Trash size={20} />
          {t('deleteFromTrip')}
        </Button>
      ) : null}
    </article>
  );
}
