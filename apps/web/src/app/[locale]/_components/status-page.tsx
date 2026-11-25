import type { ReactNode } from 'react';
import styles from './status-page.module.css';

interface StatusPageProps {
  title: string;
  /** Decorative icon from `@/shared/icons`. */
  icon?: ReactNode;
  children: ReactNode;
}

/** Full-page message (not found, error): heading, explanation, next actions. */
export function StatusPage({ title, icon, children }: StatusPageProps) {
  return (
    <main id="main" className={styles.main}>
      <div className={styles.content}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
