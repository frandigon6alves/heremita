'use client';

import { useTranslations } from 'next-intl';
import { ChipRow, type Chip } from '@/shared/components/chip-row/chip-row';
import { IconButton } from '@/shared/components/icon-button/icon-button';
import { Plus } from '@/shared/icons/icons';
import { ALL_DAYS, dayColorToken, IDEAS, type DaySelection, type PlanLike } from './plan-view';
import { dayChipsProps } from './row-focus';
import styles from './day-chips.module.css';

interface DayChipsProps {
  plan: PlanLike;
  selected: DaySelection;
  onSelect: (selection: DaySelection) => void;
  /** Owner only: the "+" chip that appends a day. */
  onAddDay?: () => void;
  addDisabled?: boolean;
}

/** `(Ideias)(Todos)(Dia 1)…(+)`: what the list and the map show. */
export function DayChips({
  plan,
  selected,
  onSelect,
  onAddDay,
  addDisabled = false,
}: DayChipsProps) {
  const t = useTranslations('itinerary.days');
  const chips: Chip<DaySelection>[] = [
    { id: IDEAS, label: t('ideas') },
    { id: ALL_DAYS, label: t('all') },
    ...plan.days.map((day) => ({
      id: day.id,
      label: t('day', { number: day.number }),
      swatch: `var(${dayColorToken(day.number)})`,
    })),
  ];

  return (
    <div className={styles.chips} {...dayChipsProps}>
      <ChipRow
        label={t('label')}
        chips={chips}
        selectedId={selected}
        onSelect={onSelect}
        trailing={
          onAddDay ? (
            <IconButton
              className={styles.add}
              label={t('add')}
              icon={<Plus size={20} />}
              variant="secondary"
              disabled={addDisabled}
              onClick={onAddDay}
            />
          ) : null
        }
      />
    </div>
  );
}
