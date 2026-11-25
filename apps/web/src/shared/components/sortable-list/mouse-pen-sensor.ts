import { PointerSensor } from '@dnd-kit/core';
import type { PointerEvent } from 'react';

const [pointerActivator] = PointerSensor.activators;

/**
 * `PointerSensor` for mouse and pen only: touch goes to `TouchSensor`, whose
 * press delay keeps a tap on the handle from starting a drag.
 */
export class MousePenSensor extends PointerSensor {
  static override activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        event: PointerEvent,
        options: Parameters<NonNullable<typeof pointerActivator>['handler']>[1],
      ) => event.nativeEvent.pointerType !== 'touch' && pointerActivator!.handler(event, options),
    },
  ];
}
