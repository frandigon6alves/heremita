'use client';

import type { MouseEvent, ReactNode } from 'react';
import styles from './stop-row.module.css';

export type OpenSource = 'pointer' | 'keyboard';

interface StopRowProps {
  name: string;
  /** Category and address line under the name. */
  detail: string | null;
  /** Visit order on its day; ideas have none. */
  order?: number;
  /** Day colour token of the badge, e.g. `--day-2`. */
  colorToken?: string;
  selected: boolean;
  /** Added a moment ago and not confirmed by the server yet. */
  pending?: boolean;
  onOpen: (source: OpenSource) => void;
  /** Row menu and drag handle (owner only). */
  controls?: ReactNode;
}

/** One place in the list: order badge, name (opens its card), owner controls. */
export function StopRow({
  name,
  detail,
  order,
  colorToken,
  selected,
  pending = false,
  onOpen,
  controls,
}: StopRowProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // `detail` is 0 for a click made with Enter or Space.
    onOpen(event.detail === 0 ? 'keyboard' : 'pointer');
  }

  return (
    <div
      className={styles.row}
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
    >
      {order === undefined ? (
        <span className={styles.idea} aria-hidden="true" />
      ) : (
        <span
          className={styles.badge}
          style={{ backgroundColor: `var(${colorToken})` }}
          aria-hidden="true"
        >
          {order}
        </span>
      )}
      <button
        type="button"
        className={styles.name}
        aria-current={selected ? 'true' : undefined}
        onClick={handleClick}
      >
        <span className={styles.title}>{name}</span>
        {detail ? <span className={styles.detail}>{detail}</span> : null}
      </button>
      {controls ? <div className={styles.controls}>{controls}</div> : null}
    </div>
  );
}
