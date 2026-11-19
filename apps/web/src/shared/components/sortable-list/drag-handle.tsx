'use client';

import { use } from 'react';
import { GripVertical } from '@/shared/icons/icons';
import { DragHandleContext } from './drag-handle-context';
import styles from './sortable-list.module.css';

/**
 * The ≡ grip that drags its row. Only inside a `SortableList` row. `label`
 * names the row ("Mover Castelo de São Jorge").
 */
export function DragHandle({ label }: { label: string }) {
  const wiring = use(DragHandleContext);
  if (wiring === null) {
    throw new Error('DragHandle must be rendered inside a SortableList row.');
  }

  const { attach, attributes, listeners } = wiring;

  return (
    <button
      type="button"
      ref={attach}
      className={styles.handle}
      {...attributes}
      {...listeners}
      aria-label={label}
    >
      <GripVertical size={20} />
    </button>
  );
}
