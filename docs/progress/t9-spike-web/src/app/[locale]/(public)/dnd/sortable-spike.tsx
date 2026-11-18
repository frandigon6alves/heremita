'use client';

import { useHydrated } from '@/app/use-hydrated';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StrictMode, useEffect, useId, useState } from 'react';

declare global {
  interface Window {
    spikeMounts?: number;
  }
}

function Row({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      data-testid={`row-${id}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid #ccc',
        background: '#fff',
      }}
    >
      <button
        type="button"
        aria-label={`Drag ${id}`}
        style={{ width: 44, height: 44, touchAction: 'none' }}
        {...attributes}
        {...listeners}
      >
        ::
      </button>
      {id}
    </li>
  );
}

function List() {
  const [items, setItems] = useState(['A', 'B', 'C', 'D']);
  const [ends, setEnds] = useState(0);
  const dndId = useId();
  useEffect(() => {
    window.spikeMounts = (window.spikeMounts ?? 0) + 1;
  }, []);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    setEnds((n) => n + 1);
    if (!over || active.id === over.id) return;
    setItems((current) =>
      arrayMove(current, current.indexOf(String(active.id)), current.indexOf(String(over.id))),
    );
  }
  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul style={{ listStyle: 'none', padding: 0, width: 300 }}>
          {items.map((id) => (
            <Row key={id} id={id} />
          ))}
        </ul>
      </SortableContext>
      <p data-testid="order">{items.join(',')}</p>
      <p data-testid="ends">{ends}</p>
      <p data-testid="hydrated" data-hydrated={useHydrated()} />
    </DndContext>
  );
}

export function SortableSpike() {
  return (
    <StrictMode>
      <List />
    </StrictMode>
  );
}
