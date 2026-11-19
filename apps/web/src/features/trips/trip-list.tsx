'use client';

import type { MyTripCard, Page } from '@heremita/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { firstPageData, myTripsQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { LoadMore } from '@/shared/components/load-more/load-more';
import { LinkButton } from '@/shared/components/link-button/link-button';
import { Shell } from '@/shared/icons/icons';
import { TripCard } from './trip-card';
import { TripListSkeleton } from './trip-list-skeleton';
import styles from './trip-list.module.css';

export interface TripListProps {
  /** First page rendered on the server; without it the list loads in the browser. */
  initialPage?: Page<MyTripCard>;
}

/** My trips (E18), last changed first, with "Load more" (never infinite scroll). */
export function TripList({ initialPage }: TripListProps) {
  const t = useTranslations('trips.mine');
  const locale = useLocale();
  const trips = useInfiniteQuery({
    ...myTripsQuery(),
    initialData: initialPage && firstPageData(initialPage),
  });

  if (trips.isPending) {
    return <TripListSkeleton />;
  }
  if (trips.isError && trips.data === undefined) {
    return (
      <ErrorState title={t('failed')} onRetry={() => void trips.refetch()} error={trips.error} />
    );
  }

  const items = trips.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Shell />}
        title={t('emptyTitle')}
        body={t('emptyBody')}
        actions={
          <>
            <LinkButton variant="primary" href={routes.newTrip(locale)}>
              {t('newTrip')}
            </LinkButton>
            <Link className={styles.exploreLink} href={routes.explore(locale)}>
              {t('emptyExplore')}
            </Link>
          </>
        }
      />
    );
  }

  return (
    <div className={styles.list}>
      <ul className={styles.grid} role="list">
        {items.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>
      <LoadMore pages={trips} failedMessage={t('moreFailed')} />
    </div>
  );
}
