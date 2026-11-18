import type { ReactNode } from 'react';
import styles from './app-bar.module.css';

interface AppBarProps {
  /** Leading control, e.g. a Back button. */
  start?: ReactNode;
  /** Title or brand. */
  children: ReactNode;
  /** Trailing controls: navigation, menu, saving status. */
  end?: ReactNode;
}

/** The 56 px top bar, clear of the notch (safe-area inset). */
export function AppBar({ start, children, end }: AppBarProps) {
  return (
    <header className={styles.appBar}>
      {start ? <div className={styles.start}>{start}</div> : null}
      <div className={styles.title}>{children}</div>
      {end ? <div className={styles.end}>{end}</div> : null}
    </header>
  );
}
