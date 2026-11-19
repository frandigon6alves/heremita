'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { MapPinPlus } from '@/shared/icons/icons';
import { dayColorToken, findPlace, isPendingId, type PlanLike } from './plan-view';
import type { DayOption } from './stop-actions';
import { StopRow, type OpenSource } from './stop-row';
import { usePlaceDetail } from './use-place-detail';
import styles from './stop-list.module.css';

export interface StopListProps {
  plan: PlanLike;
  dayId: string;
  selectedPlaceId: string | null;
  onOpen: (tripPlaceId: string, source: OpenSource) => void;
  /** The leg leaving a stop, shown under its row (not after the last stop). */
  legAfter?: (stopId: string) => ReactNode;
}

export function dayOptions(plan: PlanLike): DayOption[] {
  return plan.days.map((day) => ({ id: day.id, number: day.number, stopCount: day.stops.length }));
}

/** One day's stops in visit order, read-only. The owner's list is `EditableStopList`. */
export function StopList(props: StopListProps) {
  const t = useTranslations('itinerary');
  const day = props.plan.days.find((candidate) => candidate.id === props.dayId);
  if (!day) {
    return null;
  }
  if (day.stops.length === 0) {
    return <EmptyDay />;
  }
  return (
    <ol className={styles.list} aria-label={t('list.dayLabel', { number: day.number })}>
      {day.stops.map((stop) => (
        <li key={stop.id}>
          <DayStop {...props} day={day} stopId={stop.id} />
        </li>
      ))}
    </ol>
  );
}

/** A day without stops; `body` tells the owner how to fill it. */
export function EmptyDay({ body }: { body?: string }) {
  const t = useTranslations('itinerary');
  return (
    <EmptyState
      headingLevel={3}
      icon={<MapPinPlus size={24} />}
      title={t('list.emptyDay.title')}
      body={body}
    />
  );
}

export interface StopOnDay {
  stopId: string;
  tripPlaceId: string;
  name: string;
  index: number;
  /** Added a moment ago and not confirmed by the server yet. */
  pending: boolean;
}

interface DayStopProps extends StopListProps {
  day: PlanLike['days'][number];
  stopId: string;
  /** Row menu and drag handle (owner only). */
  controls?: (stop: StopOnDay) => ReactNode;
}

/** A stop's row and the leg leaving it. */
export function DayStop({
  plan,
  day,
  stopId,
  selectedPlaceId,
  onOpen,
  legAfter,
  controls,
}: DayStopProps) {
  const detailOf = usePlaceDetail();
  const index = day.stops.findIndex((candidate) => candidate.id === stopId);
  const stop = day.stops[index];
  const entry = stop && findPlace(plan, stop.tripPlaceId);
  if (!stop || !entry) {
    return null;
  }
  const pending = isPendingId(stop.id) || isPendingId(entry.id);
  const name = entry.place.name;
  return (
    <>
      <StopRow
        rowId={stop.id}
        name={name}
        detail={detailOf(entry.place)}
        order={index + 1}
        colorToken={dayColorToken(day.number)}
        selected={entry.id === selectedPlaceId}
        pending={pending}
        onOpen={(source) => onOpen(entry.id, source)}
        controls={controls?.({ stopId: stop.id, tripPlaceId: entry.id, name, index, pending })}
      />
      {index < day.stops.length - 1 ? legAfter?.(stop.id) : null}
    </>
  );
}
