import type { ReactNode } from 'react';
import styles from './empty-state.module.css';

export interface EmptyStateProps {
  /** Says why it is empty: "no data yet" and "no results" read differently. */
  title: ReactNode;
  body?: ReactNode;
  /** The next step: usually one `Button` or `LinkButton`, at most two. */
  actions?: ReactNode;
  /** Decorative icon from `@/shared/icons`. */
  icon?: ReactNode;
  /** Keeps the page outline without skipped levels; defaults to 2. */
  headingLevel?: 2 | 3;
}

/** Empty state of a data region: why there is nothing and what to do next. */
export function EmptyState({ title, body, actions, icon, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <div className={styles.emptyState}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <Heading className={styles.title}>{title}</Heading>
      {body ? <p className={styles.body}>{body}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
