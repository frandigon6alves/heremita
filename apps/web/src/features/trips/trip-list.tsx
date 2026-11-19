'use client';

import type { MyTripCard, Page } from '@heremita/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ApiProblemError, HttpError } from '@/lib/api/problem';
import { myTripsQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { LinkButton } from '@/shared/components/link-button/link-button';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { Shell } from '@/shared/icons/icons';
import { FormAlert } from './form-alert';
import { TripCard } from './trip-card';
import styles from './trip-list.module.css';

function codeOf(error: unknown): string | undefined {
  return error instanceof ApiProblemError ? error.code : undefined;
}

function requestIdOf(error: unknown): string | undefined {
  return error instanceof ApiProblemError || error instanceof HttpError
    ? (error.requestId ?? undefined)
    : undefined;
}

/** Same space as the first cards, while they load. */
export function TripListSkeleton() {
  return (
    <Skeleton>
      <div className={styles.grid}>
        <SkeletonBlock height="8.5rem" />
        <SkeletonBlock height="8.5rem" />
        <SkeletonBlock height="8.5rem" />
      </div>
    </Skeleton>
  );
}

export interface TripListProps {
  /** First page rendered on the server; without it the list loads in the browser. */
  initialPage?: Page<MyTripCard>;
}

/** My trips (E18), last changed first, with "Load more" (never infinite scroll). */
export function TripList({ initialPage }: TripListProps) {
  const t = useTranslations('trips.mine');
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  const trips = useInfiniteQuery({
    ...myTripsQuery(),
    initialData: initialPage && { pages: [initialPage], pageParams: [null] },
  });

  if (trips.isPending) {
    return <TripListSkeleton />;
  }
  if (trips.isError && trips.data === undefined) {
    return (
      <ErrorState
        title={t('failed')}
        onRetry={() => void trips.refetch()}
        code={codeOf(trips.error)}
        requestId={requestIdOf(trips.error)}
      />
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
      {trips.isFetchNextPageError ? (
        <FormAlert
          message={t('moreFailed')}
          code={codeOf(trips.error)}
          requestId={requestIdOf(trips.error)}
        />
      ) : null}
      {trips.hasNextPage ? (
        <Button
          className={styles.more}
          busy={trips.isFetchingNextPage}
          onClick={() => void trips.fetchNextPage()}
        >
          {tActions('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
