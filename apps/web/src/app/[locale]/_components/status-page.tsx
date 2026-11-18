import type { ReactNode } from 'react';
import styles from './status-page.module.css';

interface StatusPageProps {
  title: string;
  children: ReactNode;
}

/** Full-page message (not found, error): heading, explanation, next actions. */
export function StatusPage({ title, children }: StatusPageProps) {
  return (
    <main id="main" className={styles.main}>
      <div className={styles.content}>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
