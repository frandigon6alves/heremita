'use client';

import type { Page, PublicTripCard as PublicTripCardData } from '@heremita/shared';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/shared/components/button/button';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { PublicTripCard } from './public-trip-card';
import styles from './public-trip-feed.module.css';

/** E48 (`exploreQuery`) or E16 (`userTripsQuery`): both page public trip cards. */
export type PublicTripPages = UseInfiniteQueryResult<InfiniteData<Page<PublicTripCardData>>>;

/** The server-rendered first page as TanStack's `initialData`. */
export function firstPageData(page: Page<PublicTripCardData> | undefined) {
  return page && { pages: [page], pageParams: [null] };
}

/** Same space as the first cards, while they load. */
export function PublicTripFeedSkeleton() {
  return (
    <Skeleton>
      <div className={styles.grid}>
        <SkeletonBlock height="16rem" />
        <SkeletonBlock height="16rem" />
        <SkeletonBlock height="16rem" />
      </div>
    </Skeleton>
  );
}

export interface PublicTripFeedProps {
  trips: PublicTripPages;
  /** What an empty feed says and offers ("no results" reads differently from "nothing yet"). */
  empty: ReactNode;
  /** Error state title of this feed. */
  failedTitle: string;
  /** Level of the card titles (2 under the page title, 3 under a section heading). */
  headingLevel?: 2 | 3;
}

/** A paged grid of public trip cards with loading, empty, error and "Load more". */
export function PublicTripFeed({
  trips,
  empty,
  failedTitle,
  headingLevel = 2,
}: PublicTripFeedProps) {
  const t = useTranslations('explore.feed');
  const tActions = useTranslations('common.actions');

  if (trips.isPending) {
    return <PublicTripFeedSkeleton />;
  }
  if (trips.isError && trips.data === undefined) {
    return (
      <ErrorState
        headingLevel={headingLevel}
        title={failedTitle}
        onRetry={() => void trips.refetch()}
        error={trips.error}
      />
    );
  }

  const items = trips.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return empty;
  }
  return (
    <div className={styles.feed}>
      <ul className={styles.grid} role="list">
        {items.map((trip) => (
          <li key={trip.id}>
            <PublicTripCard trip={trip} headingLevel={headingLevel} />
          </li>
        ))}
      </ul>
      {trips.isFetchNextPageError ? (
        <FormAlert error={trips.error} message={t('moreFailed')} />
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
