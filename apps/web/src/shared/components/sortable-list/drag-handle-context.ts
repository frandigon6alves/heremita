import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { createContext } from 'react';

export interface DragHandleWiring {
  attach: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

/** Lets the row's `DragHandle` start the drag without the caller threading props through. */
export const DragHandleContext = createContext<DragHandleWiring | null>(null);
