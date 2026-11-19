'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useRef, type ReactNode } from 'react';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { DragHandle } from '@/shared/components/sortable-list/drag-handle';
import { MapPinPlus } from '@/shared/icons/icons';
import type { PlanEditor } from './plan-editor';
import { dayColorToken, findPlace, isPendingId, type PlanLike } from './plan-view';
import { focusAfterLeaving } from './row-focus';
import { StopActions, type DayOption } from './stop-actions';
import { StopRow, type OpenSource } from './stop-row';
import { usePlaceDetail } from './use-place-detail';
import styles from './stop-list.module.css';

/** dnd-kit loads only where the owner can reorder; read-only lists never fetch it. */
const SortableList = lazy(() =>
  import('@/shared/components/sortable-list/sortable-list').then((module) => ({
    default: module.SortableList,
  })),
);

interface StopListProps {
  plan: PlanLike;
  dayId: string;
  selectedPlaceId: string | null;
  onOpen: (tripPlaceId: string, source: OpenSource) => void;
  editor?: PlanEditor;
  /** The leg leaving a stop, shown under its row (not after the last stop). */
  legAfter?: (stopId: string) => ReactNode;
}

export function dayOptions(plan: PlanLike): DayOption[] {
  return plan.days.map((day) => ({ id: day.id, number: day.number, stopCount: day.stops.length }));
}

/**
 * One day's stops in visit order. For the owner each row has a ⋮ menu and
 * a drag handle (both reorder: the menu is the no-drag twin, V55).
 */
export function StopList({
  plan,
  dayId,
  selectedPlaceId,
  onOpen,
  editor,
  legAfter,
}: StopListProps) {
  const t = useTranslations('itinerary');
  const detailOf = usePlaceDetail();
  const listRef = useRef<HTMLDivElement>(null);
  const day = plan.days.find((candidate) => candidate.id === dayId);
  if (!day) {
    return null;
  }
  const label = t('list.dayLabel', { number: day.number });

  if (day.stops.length === 0) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<MapPinPlus size={24} />}
        title={t('list.emptyDay.title')}
        body={editor ? t('list.emptyDay.body') : undefined}
      />
    );
  }

  const nameOf = (stopId: string) => {
    const stop = day.stops.find((candidate) => candidate.id === stopId);
    return (stop && findPlace(plan, stop.tripPlaceId)?.place.name) ?? '';
  };

  const row = (stopId: string, controls: boolean) => {
    const index = day.stops.findIndex((candidate) => candidate.id === stopId);
    const stop = day.stops[index];
    const entry = stop && findPlace(plan, stop.tripPlaceId);
    if (!stop || !entry) {
      return null;
    }
    const pending = isPendingId(stop.id) || isPendingId(entry.id);
    const name = entry.place.name;
    const leg = index < day.stops.length - 1 ? legAfter?.(stop.id) : null;
    const leave = () => focusAfterLeaving(listRef.current, stop.id);
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
          controls={
            controls && editor ? (
              <>
                <StopActions
                  name={name}
                  dayId={day.id}
                  index={index}
                  total={day.stops.length}
                  days={dayOptions(plan)}
                  disabled={editor.disabled || pending}
                  onMove={(toDayId, toIndex) => {
                    if (toDayId !== day.id) {
                      leave();
                    }
                    editor.actions.move({ stopId: stop.id, name, dayId: toDayId, index: toIndex });
                  }}
                  onMoveToNewDay={() => {
                    leave();
                    void editor.actions.moveToNewDay({ stopId: stop.id, name });
                  }}
                  onRemoveFromDay={() => {
                    leave();
                    editor.actions.removeFromDay({
                      stopId: stop.id,
                      name,
                      dayId: day.id,
                      index,
                      tripPlaceId: entry.id,
                    });
                  }}
                  onDeleteFromTrip={() => {
                    leave();
                    editor.actions.deleteFromTrip(entry.id);
                  }}
                />
                <DragHandle label={t('row.drag', { name })} />
              </>
            ) : null
          }
        />
        {leg}
      </>
    );
  };

  const readOnlyList = (
    <ol className={styles.list} aria-label={label}>
      {day.stops.map((stop) => (
        <li key={stop.id}>{row(stop.id, false)}</li>
      ))}
    </ol>
  );

  if (!editor) {
    return readOnlyList;
  }

  return (
    <div ref={listRef}>
      <Suspense fallback={readOnlyList}>
        <SortableList
          items={day.stops.map((stop) => stop.id)}
          label={label}
          disabled={editor.disabled}
          renderItem={(stopId) => row(stopId, true)}
          onMove={({ id, to }) =>
            editor.actions.move({ stopId: id, name: nameOf(id), dayId: day.id, index: to })
          }
          announcements={{
            instructions: t('drag.instructions'),
            roleDescription: t('drag.roleDescription'),
            pickedUp: (id, position, total) =>
              t('drag.pickedUp', { name: nameOf(id), position, total }),
            movedTo: (id, position, total) =>
              t('drag.movedTo', { name: nameOf(id), position, total }),
            dropped: (id, position, total) =>
              t('drag.dropped', { name: nameOf(id), position, total }),
            cancelled: (id, position, total) =>
              t('drag.cancelled', { name: nameOf(id), position, total }),
          }}
        />
      </Suspense>
    </div>
  );
}
