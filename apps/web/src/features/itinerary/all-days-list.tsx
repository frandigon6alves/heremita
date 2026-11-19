'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { MapPinPlus } from '@/shared/icons/icons';
import { dayColorToken, findPlace, ideaIds, isPendingId, type PlanLike } from './plan-view';
import { StopRow, type OpenSource } from './stop-row';
import { usePlaceDetail } from './use-place-detail';
import styles from './stop-list.module.css';

interface AllDaysListProps {
  plan: PlanLike;
  selectedPlaceId: string | null;
  onOpen: (tripPlaceId: string, source: OpenSource) => void;
  /** A viewer's page: an empty trip invites no edit. */
  readOnly?: boolean;
}

/** "Todos": every day under its own heading, then the ideas. Edits happen in one day's view. */
export function AllDaysList({ plan, selectedPlaceId, onOpen, readOnly = false }: AllDaysListProps) {
  const t = useTranslations('itinerary');
  const detailOf = usePlaceDetail();
  const ideas = ideaIds(plan);

  if (plan.places.length === 0) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<MapPinPlus size={24} />}
        title={t('list.emptyTrip.title')}
        body={readOnly ? undefined : t('list.emptyTrip.body')}
      />
    );
  }

  const rowOf = (tripPlaceId: string, key: string, order?: number, dayNumber?: number) => {
    const entry = findPlace(plan, tripPlaceId);
    if (!entry) {
      return null;
    }
    return (
      <li key={key}>
        <StopRow
          name={entry.place.name}
          detail={detailOf(entry.place)}
          order={order}
          colorToken={dayNumber === undefined ? undefined : dayColorToken(dayNumber)}
          selected={tripPlaceId === selectedPlaceId}
          pending={isPendingId(key) || isPendingId(tripPlaceId)}
          onOpen={(source) => onOpen(tripPlaceId, source)}
        />
      </li>
    );
  };

  return (
    <div className={styles.sections}>
      {plan.days.map((day) => (
        <section key={day.id} aria-labelledby={`all-day-${day.id}`}>
          <h3 id={`all-day-${day.id}`} className={styles.heading}>
            {t('days.day', { number: day.number })}
          </h3>
          {day.stops.length === 0 ? (
            <p className={styles.none}>{t('list.emptyDay.title')}</p>
          ) : (
            <ol className={styles.list}>
              {day.stops.map((stop, index) =>
                rowOf(stop.tripPlaceId, stop.id, index + 1, day.number),
              )}
            </ol>
          )}
        </section>
      ))}
      {ideas.length > 0 ? (
        <section aria-labelledby="all-ideas">
          <h3 id="all-ideas" className={styles.heading}>
            {t('days.ideas')}
          </h3>
          <ul className={styles.list}>{ideas.map((id) => rowOf(id, id))}</ul>
        </section>
      ) : null}
    </div>
  );
}
