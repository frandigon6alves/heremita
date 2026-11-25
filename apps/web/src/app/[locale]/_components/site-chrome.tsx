import type { ReactNode } from 'react';
import styles from './site-chrome.module.css';

interface SiteChromeProps {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * The site header and footer around every page. A trip screen (the planner,
 * a public trip, a shared trip, and their loading states) has its own app bar
 * and marks itself with `data-trip-screen`; CSS then hides the chrome. Deciding
 * from what rendered, not from the URL, keeps the chrome on the 404 or error
 * page of a trip URL (a revoked share link). The locale layout renders it once,
 * so the header's client code ships in the layout's chunk only (B13).
 */
export function SiteChrome({ header, footer, children }: SiteChromeProps) {
  return (
    <>
      <div className={styles.chrome}>{header}</div>
      {children}
      <div className={styles.chrome}>{footer}</div>
    </>
  );
}
