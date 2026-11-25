'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { DragHandleContext } from './drag-handle-context';
import { MousePenSensor } from './mouse-pen-sensor';
import styles from './sortable-list.module.css';

/** Screen-reader text for a drag, in the viewer's language. Positions are 1-based. */
export interface SortableAnnouncements<Id extends string> {
  /** Read when a handle gets focus: how to pick up, move and drop with the keyboard. */
  instructions: string;
  /** Replaces dnd-kit's English "draggable" role description on handles. */
  roleDescription: string;
  pickedUp: (id: Id, position: number, total: number) => string;
  movedTo: (id: Id, position: number, total: number) => string;
  dropped: (id: Id, position: number, total: number) => string;
  cancelled: (id: Id, position: number, total: number) => string;
}

export interface SortableMove<Id extends string> {
  id: Id;
  from: number;
  to: number;
  /** The whole order after the move. */
  order: Id[];
}

export interface SortableListProps<Id extends string> {
  /** Ids in their current order; the list never reorders itself, the parent applies `onMove`. */
  items: readonly Id[];
  /** Accessible name of the list. */
  label: string;
  /** Row content; put a `DragHandle` in it. */
  renderItem: (id: Id, state: { isDragging: boolean }) => ReactNode;
  onMove: (move: SortableMove<Id>) => void;
  announcements: SortableAnnouncements<Id>;
  /** Offline or read-only: handles stay visible but do nothing. */
  disabled?: boolean;
}

/**
 * Vertical list reordered by dragging each row's `DragHandle`: mouse/pen
 * after 4 px, touch after a 200 ms press (the handle has `touch-action: none`:
 * a swipe elsewhere on the row scrolls), keyboard
 * with Space + arrows. The drag is one way among several: rows still need
 * their own move-up/down menu (V55).
 */
export function SortableList<Id extends string>({
  items,
  label,
  renderItem,
  onMove,
  announcements,
  disabled = false,
}: SortableListProps<Id>) {
  const dndId = useId();
  const lastOver = useRef<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(MousePenSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const total = items.length;
  const positionOf = (id: UniqueIdentifier) => items.indexOf(id as Id) + 1;
  const announce = (
    message: (id: Id, position: number, total: number) => string,
    id: UniqueIdentifier,
    at: UniqueIdentifier = id,
  ) => message(id as Id, positionOf(at), total);

  const dndAnnouncements: Announcements = {
    onDragStart: ({ active }) => {
      lastOver.current = active.id;
      return announce(announcements.pickedUp, active.id);
    },
    // dnd-kit reports the row's own slot right after pick-up; only real moves are read out.
    onDragOver: ({ active, over }) => {
      if (over === null || over.id === lastOver.current) {
        return undefined;
      }
      lastOver.current = over.id;
      return announce(announcements.movedTo, active.id, over.id);
    },
    onDragEnd: ({ active, over }) =>
      announce(announcements.dropped, active.id, over?.id ?? active.id),
    onDragCancel: ({ active }) => announce(announcements.cancelled, active.id),
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) {
      return;
    }
    const from = items.indexOf(active.id as Id);
    const to = items.indexOf(over.id as Id);
    if (from === -1 || to === -1) {
      return;
    }
    onMove({ id: active.id as Id, from, to, order: arrayMove([...items], from, to) });
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements: dndAnnouncements,
        screenReaderInstructions: { draggable: announcements.instructions },
      }}
    >
      <SortableContext
        items={[...items]}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {/* Ordered: the position is the point of a reorderable list (the read-only one is an <ol> too). */}
        <ol className={styles.list} aria-label={label}>
          {items.map((id) => (
            <SortableRow key={id} id={id} roleDescription={announcements.roleDescription}>
              {(isDragging) => renderItem(id, { isDragging })}
            </SortableRow>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  roleDescription,
  children,
}: {
  id: string;
  roleDescription: string;
  children: (isDragging: boolean) => ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    attributes: { roleDescription },
    transition: reducedMotion ? null : undefined,
  });

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? `${styles.row} ${styles.dragging}` : styles.row}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <DragHandleContext value={{ attach: setActivatorNodeRef, attributes, listeners }}>
        {children(isDragging)}
      </DragHandleContext>
    </li>
  );
}
