'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { DragHandle } from '@/shared/components/sortable-list/drag-handle';
import { SortableList } from '@/shared/components/sortable-list/sortable-list';
import type { PlanEditor } from './plan-editor';
import { findPlace } from './plan-view';
import { focusAfterLeaving } from './row-focus';
import { StopActions } from './stop-actions';
import { dayOptions, DayStop, EmptyDay, type StopListProps } from './stop-list';

/**
 * The owner's day: each row has a ⋮ menu and a drag handle (both reorder: the
 * menu is the no-drag twin, V55). dnd-kit is imported here, on the planner
 * only, so the rows render sortable from the first paint and are never swapped.
 */
export function EditableStopList({ editor, ...props }: StopListProps & { editor: PlanEditor }) {
  const t = useTranslations('itinerary');
  const listRef = useRef<HTMLDivElement>(null);
  const { plan } = props;
  const day = plan.days.find((candidate) => candidate.id === props.dayId);
  if (!day) {
    return null;
  }
  if (day.stops.length === 0) {
    return <EmptyDay body={t('list.emptyDay.body')} />;
  }

  const nameOf = (stopId: string) => {
    const stop = day.stops.find((candidate) => candidate.id === stopId);
    return (stop && findPlace(plan, stop.tripPlaceId)?.place.name) ?? '';
  };

  return (
    <div ref={listRef}>
      <SortableList
        items={day.stops.map((stop) => stop.id)}
        label={t('list.dayLabel', { number: day.number })}
        disabled={editor.disabled}
        renderItem={(stopId) => (
          <DayStop
            {...props}
            day={day}
            stopId={stopId}
            controls={({ tripPlaceId, name, index, pending }) => {
              const leave = () => focusAfterLeaving(listRef.current, stopId);
              return (
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
                      editor.actions.move({ stopId, name, dayId: toDayId, index: toIndex });
                    }}
                    onMoveToNewDay={() => {
                      leave();
                      void editor.actions.moveToNewDay({ stopId, name });
                    }}
                    onRemoveFromDay={() => {
                      leave();
                      editor.actions.removeFromDay({
                        stopId,
                        name,
                        dayId: day.id,
                        index,
                        tripPlaceId,
                      });
                    }}
                    onDeleteFromTrip={() => {
                      leave();
                      editor.actions.deleteFromTrip(tripPlaceId);
                    }}
                  />
                  <DragHandle label={t('row.drag', { name })} />
                </>
              );
            }}
          />
        )}
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
    </div>
  );
}
