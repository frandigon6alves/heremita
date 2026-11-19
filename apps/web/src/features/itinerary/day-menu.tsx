'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ConfirmDialog } from '@/shared/components/dialog/confirm-dialog';
import { PopoverMenu } from '@/shared/components/popover-menu/popover-menu';
import { Ellipsis, Trash } from '@/shared/icons/icons';
import type { PlanEditor } from './plan-editor';

interface DayMenuProps {
  dayId: string;
  number: number;
  stopCount: number;
  editor: PlanEditor;
  /** The day is gone (optimistically): select another one. */
  onDeleted: () => void;
}

/**
 * The selected day's ⋯ menu. An empty day is deleted at once; a day with
 * stops asks first, since Undo cannot rebuild it in one call (CD8).
 */
export function DayMenu({ dayId, number, stopCount, editor, onDeleted }: DayMenuProps) {
  const t = useTranslations('itinerary.dayMenu');
  const [confirming, setConfirming] = useState(false);

  function remove() {
    setConfirming(false);
    editor.actions.deleteDay(dayId, number);
    onDeleted();
  }

  return (
    <>
      <PopoverMenu
        trigger={<Ellipsis size={20} />}
        label={t('label', { number })}
        disabled={editor.disabled}
        sections={[
          {
            items: [
              {
                id: 'delete',
                label: t('delete', { number }),
                icon: <Trash size={20} />,
                tone: 'danger',
                onSelect: () => (stopCount === 0 ? remove() : setConfirming(true)),
              },
            ],
          },
        ]}
      />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('confirmTitle', { number })}
        confirmLabel={t('delete', { number })}
        onConfirm={remove}
      >
        <p>{t('confirmBody', { count: stopCount })}</p>
      </ConfirmDialog>
    </>
  );
}
