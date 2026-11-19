'use client';

import { useTranslations } from 'next-intl';
import { PopoverMenu, type PopoverMenuItem } from '@/shared/components/popover-menu/popover-menu';
import { Ellipsis, Plus, Trash } from '@/shared/icons/icons';

export interface DayOption {
  id: string;
  number: number;
  stopCount: number;
}

interface StopActionsProps {
  name: string;
  dayId: string;
  index: number;
  total: number;
  days: readonly DayOption[];
  disabled: boolean;
  /** Same day: reorder; another day: appended there. */
  onMove: (dayId: string, index: number) => void;
  onMoveToNewDay: () => void;
  onRemoveFromDay: () => void;
  onDeleteFromTrip: () => void;
}

function dayItems(
  days: readonly DayOption[],
  currentDayId: string | null,
  label: (number: number) => string,
  onChoose: (day: DayOption) => void,
): PopoverMenuItem[] {
  return days.map((day) => ({
    id: day.id,
    label: label(day.number),
    current: day.id === currentDayId,
    disabled: day.id === currentDayId,
    onSelect: () => onChoose(day),
  }));
}

/**
 * Row ⋮ menu of a stop: the no-drag way to reorder (V55), move to another
 * day (or a new one), and the two different removals.
 */
export function StopActions({
  name,
  dayId,
  index,
  total,
  days,
  disabled,
  onMove,
  onMoveToNewDay,
  onRemoveFromDay,
  onDeleteFromTrip,
}: StopActionsProps) {
  const t = useTranslations('itinerary.row');
  const tDays = useTranslations('itinerary.days');
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <PopoverMenu
      trigger={<Ellipsis size={20} />}
      label={t('actions', { name })}
      disabled={disabled}
      sections={[
        {
          items: [
            {
              id: 'up',
              label: t('moveUp'),
              disabled: isFirst,
              onSelect: () => onMove(dayId, index - 1),
            },
            {
              id: 'down',
              label: t('moveDown'),
              disabled: isLast,
              onSelect: () => onMove(dayId, index + 1),
            },
            {
              id: 'first',
              label: t('moveFirst'),
              disabled: isFirst,
              onSelect: () => onMove(dayId, 0),
            },
            {
              id: 'last',
              label: t('moveLast'),
              disabled: isLast,
              onSelect: () => onMove(dayId, total - 1),
            },
          ],
        },
        {
          heading: t('moveToDay'),
          items: [
            ...dayItems(
              days,
              dayId,
              (number) => tDays('day', { number }),
              (day) => onMove(day.id, day.stopCount),
            ),
            {
              id: 'new-day',
              label: t('newDay'),
              icon: <Plus size={20} />,
              onSelect: onMoveToNewDay,
            },
          ],
        },
        {
          items: [
            { id: 'remove', label: t('removeFromDay'), onSelect: onRemoveFromDay },
            {
              id: 'delete',
              label: t('deleteFromTrip'),
              icon: <Trash size={20} />,
              tone: 'danger',
              onSelect: onDeleteFromTrip,
            },
          ],
        },
      ]}
    />
  );
}

interface IdeaActionsProps {
  name: string;
  days: readonly DayOption[];
  disabled: boolean;
  onSchedule: (dayId: string, index: number) => void;
  onScheduleNewDay: () => void;
  onDeleteFromTrip: () => void;
}

/** Row ⋮ menu of an idea: put it on a day, or delete it from the trip. */
export function IdeaActions({
  name,
  days,
  disabled,
  onSchedule,
  onScheduleNewDay,
  onDeleteFromTrip,
}: IdeaActionsProps) {
  const t = useTranslations('itinerary.row');
  const tDays = useTranslations('itinerary.days');

  return (
    <PopoverMenu
      trigger={<Ellipsis size={20} />}
      label={t('actions', { name })}
      disabled={disabled}
      sections={[
        {
          heading: t('addToDay'),
          items: [
            ...dayItems(
              days,
              null,
              (number) => tDays('day', { number }),
              (day) => onSchedule(day.id, day.stopCount),
            ),
            {
              id: 'new-day',
              label: t('newDay'),
              icon: <Plus size={20} />,
              onSelect: onScheduleNewDay,
            },
          ],
        },
        {
          items: [
            {
              id: 'delete',
              label: t('deleteFromTrip'),
              icon: <Trash size={20} />,
              tone: 'danger',
              onSelect: onDeleteFromTrip,
            },
          ],
        },
      ]}
    />
  );
}
