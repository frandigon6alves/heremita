import type { ReactNode } from 'react';
import styles from './auth-page.module.css';

interface AuthPageProps {
  title: string;
  intro?: string;
  children: ReactNode;
}

/** Page frame of the auth forms: heading and form in a left-aligned column. */
export function AuthPage({ title, intro, children }: AuthPageProps) {
  return (
    <main id="main" className={styles.main}>
      <div className={styles.column}>
        <h1>{title}</h1>
        {intro === undefined ? null : <p className={styles.intro}>{intro}</p>}
        {children}
      </div>
    </main>
  );
}
