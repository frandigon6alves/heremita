import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { routes } from '@/lib/routes';
import { LinkButton } from '@/shared/components/link-button/link-button';
import { Plus } from '@/shared/icons/icons';
import styles from './my-trips-page.module.css';

/**
 * The "My trips" page body: heading and "New trip" (a floating button at the
 * bottom right on phones, a header button from tablet width), then `children`.
 */
export function MyTripsPage({ children }: { children: ReactNode }) {
  const t = useTranslations('trips.mine');
  const locale = useLocale();

  return (
    <main id="main" className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
        <LinkButton className={styles.newTrip} variant="primary" href={routes.newTrip(locale)}>
          <Plus size={20} />
          {t('newTrip')}
        </LinkButton>
      </header>
      {children}
    </main>
  );
}
