'use client';

import { useTranslations } from 'next-intl';
import { PopoverMenu } from '@/shared/components/popover-menu/popover-menu';
import type { PlanEditor } from './plan-editor';
import { stopsOfPlace, type PlanLike } from './plan-view';
import styles from './day-assign.module.css';

interface DayAssignProps {
  plan: PlanLike;
  tripPlaceId: string;
  name: string;
  editor: PlanEditor;
  disabled: boolean;
}

/**
 * "Dia: Ideias ▾" on the place card: puts the place on a day, moves its only
 * stop to another day, or back to the ideas.
 */
export function DayAssign({ plan, tripPlaceId, name, editor, disabled }: DayAssignProps) {
  const t = useTranslations('itinerary.card');
  const tDays = useTranslations('itinerary.days');
  const stops = stopsOfPlace(plan, tripPlaceId);
  const onDays = new Set(stops.map((stop) => stop.dayId));
  const [only] = stops.length === 1 ? stops : [];
  const numbers = plan.days.filter((day) => onDays.has(day.id)).map((day) => day.number);
  const current =
    numbers.length === 0
      ? tDays('ideas')
      : numbers.map((number) => tDays('day', { number })).join(', ');

  return (
    <PopoverMenu
      trigger={
        <>
          {t('dayButton', { days: current })}
          <span aria-hidden="true">▾</span>
        </>
      }
      triggerClassName={styles.trigger}
      disabled={disabled}
      sections={[
        {
          heading: t('dayMenu'),
          items: [
            {
              id: 'ideas',
              label: tDays('ideas'),
              current: stops.length === 0,
              disabled: only === undefined,
              onSelect: () => {
                if (only) {
                  editor.actions.removeFromDay({ ...only, name, tripPlaceId });
                }
              },
            },
            ...plan.days.map((day) => ({
              id: day.id,
              label: tDays('day', { number: day.number }),
              current: onDays.has(day.id),
              disabled: onDays.has(day.id),
              onSelect: () => {
                if (only) {
                  editor.actions.move({
                    stopId: only.stopId,
                    name,
                    dayId: day.id,
                    index: day.stops.length,
                  });
                } else {
                  editor.actions.schedule({
                    tripPlaceId,
                    name,
                    dayId: day.id,
                    index: day.stops.length,
                  });
                }
              },
            })),
          ],
        },
      ]}
    />
  );
}
