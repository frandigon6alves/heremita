'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from 'react';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import {
  clampHeight,
  cycleSnap,
  releaseSnap,
  releaseVelocity,
  snapHeights,
  type CycleDirection,
  type PointerSample,
  type Snap,
  type SnapHeights,
} from './snap-math';
import styles from './bottom-sheet.module.css';

export type { Snap } from './snap-math';

/** Where the sheet becomes a side panel; `bottom-sheet.module.css` switches the layout at the same width. */
export const PANEL_QUERY = '(min-width: 768px)';

/** Finger travel before a press on the header becomes a sheet drag (a tap still hits the chip). */
const DRAG_SLOP_PX = 8;
/** Enough pointer samples to cover the 100 ms velocity window at 120 Hz. */
const MAX_SAMPLES = 16;

export interface BottomSheetProps {
  snap: Snap;
  onSnapChange: (snap: Snap) => void;
  /** The sheet stopped moving at this height (px): pad the map by it. Never per drag frame. */
  onSnapSettled?: (heightPx: number) => void;
  /** Id of the heading that names the region. */
  labelledBy: string;
  /** Handle button name stating the current snap and what pressing does ("Panel: half height. Expand"). */
  handleLabel: (snap: Snap, next: Snap) => string;
  /** Drag area under the handle: day chips and the day summary. */
  header: ReactNode;
  /** Scrolls on its own; never drags the sheet. */
  children: ReactNode;
}

interface Gesture {
  pointerId: number;
  startY: number;
  startHeight: number;
  heights: SnapHeights;
  samples: PointerSample[];
  dragging: boolean;
}

function measureHeights(sheet: HTMLElement): SnapHeights {
  const style = getComputedStyle(sheet);
  return snapHeights({
    viewportHeight: window.innerHeight,
    minHeight: Number.parseFloat(style.minHeight) || 0,
    maxHeight: Number.parseFloat(style.maxHeight) || window.innerHeight,
  });
}

/**
 * The planner's non-modal bottom sheet over the map (phone) or its side
 * panel (from `PANEL_QUERY`). One markup at every width, so the server
 * render already has the right layout: CSS turns the sheet into the panel
 * and hides the handle, and the snap mechanics do nothing there. Three
 * snaps; the header drags it (release → nearest snap, or the next one in a
 * fling's direction); the handle button cycles peek → half → full → half for
 * taps, Enter and screen readers. No focus trap and the map stays operable:
 * it is a region, not a dialog.
 */
export function BottomSheet({
  snap,
  onSnapChange,
  onSnapSettled,
  labelledBy,
  handleLabel,
  header,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [direction, setDirection] = useState<CycleDirection>('up');
  const reducedMotion = useReducedMotion();
  const wide = useMediaQuery(PANEL_QUERY);
  const next = cycleSnap(snap, direction);

  function reportSettled() {
    const sheet = sheetRef.current;
    if (sheet !== null && onSnapSettled !== undefined) {
      onSnapSettled(measureHeights(sheet)[snap]);
    }
  }
  const reportSettledFromEffect = useEffectEvent(reportSettled);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (wide || dragHeight !== null || sheet === null) {
      return;
    }
    const target = measureHeights(sheet)[snap];
    const alreadyThere = Math.abs(sheet.getBoundingClientRect().height - target) < 1;
    // Otherwise the height transition is running and `transitionend` reports it.
    if (reducedMotion || alreadyThere) {
      reportSettledFromEffect();
    }
  }, [wide, snap, dragHeight, reducedMotion]);

  useEffect(() => {
    if (wide) {
      return;
    }
    const onResize = () => reportSettledFromEffect();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [wide]);

  function handleCycle() {
    setDirection(next.direction);
    onSnapChange(next.snap);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (wide || !event.isPrimary || event.button !== 0 || sheet === null) {
      return;
    }
    suppressClick.current = false;
    gesture.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sheet.getBoundingClientRect().height,
      heights: measureHeights(sheet),
      samples: [],
      dragging: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current === null || current.pointerId !== event.pointerId) {
      return;
    }
    // A mouse released outside the header before the drag began never sent pointerup here.
    if (event.pointerType !== 'touch' && event.buttons === 0) {
      gesture.current = null;
      return;
    }
    const grownBy = current.startY - event.clientY;
    if (!current.dragging) {
      if (Math.abs(grownBy) < DRAG_SLOP_PX) {
        return;
      }
      current.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const height = clampHeight(current.startHeight + grownBy, current.heights);
    current.samples = [...current.samples, { height, time: event.timeStamp }].slice(-MAX_SAMPLES);
    setDragHeight(height);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current === null || current.pointerId !== event.pointerId) {
      return;
    }
    gesture.current = null;
    if (!current.dragging) {
      return;
    }
    suppressClick.current = true;
    const height = current.samples.at(-1)?.height ?? current.startHeight;
    const target = releaseSnap(height, releaseVelocity(current.samples), current.heights);
    setDragHeight(null);
    if (target !== snap) {
      onSnapChange(target);
    }
  }

  function handlePointerCancel() {
    gesture.current = null;
    setDragHeight(null);
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    // The press that ended a drag is not also a tap on the chip under the finger.
    if (suppressClick.current) {
      suppressClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    }
  }

  function handleBodyFocus() {
    // Tabbing into the body or rows hidden below the peek line opens the sheet so focus stays visible.
    if (!wide && snap === 'peek') {
      onSnapChange('half');
    }
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (
      !wide &&
      event.target === event.currentTarget &&
      event.propertyName === 'height' &&
      dragHeight === null
    ) {
      reportSettled();
    }
  }

  return (
    <section
      ref={sheetRef}
      className={dragHeight === null ? styles.sheet : `${styles.sheet} ${styles.dragging}`}
      data-snap={snap}
      aria-labelledby={labelledBy}
      style={dragHeight === null ? undefined : { height: dragHeight }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        className={styles.header}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
      >
        <button
          type="button"
          className={styles.handle}
          aria-label={handleLabel(snap, next.snap)}
          onClick={handleCycle}
        >
          <span className={styles.grabber} aria-hidden="true" />
        </button>
        {header}
      </div>
      {/* Focusable: a scroll region must be keyboard-scrollable even with no focusable content. */}
      <div className={styles.body} tabIndex={0} onFocus={handleBodyFocus}>
        {children}
      </div>
    </section>
  );
}
