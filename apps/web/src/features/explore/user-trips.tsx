'use client';

import type { Page, PublicTripCard } from '@heremita/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { firstPageData, userTripsQuery } from '@/lib/api/query-keys';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { PublicTripFeed } from './public-trip-feed';

export interface UserTripsProps {
  userId: string;
  initialPage?: Page<PublicTripCard>;
}

/** A traveller's public trips (E16) under the profile's "Public trips" heading. */
export function UserTrips({ userId, initialPage }: UserTripsProps) {
  const t = useTranslations('explore.profile');
  const trips = useInfiniteQuery({
    ...userTripsQuery(userId),
    initialData: initialPage && firstPageData(initialPage),
  });

  return (
    <PublicTripFeed
      trips={trips}
      failedTitle={t('tripsFailed')}
      headingLevel={3}
      empty={<EmptyState headingLevel={3} title={t('tripsEmpty')} />}
    />
  );
}
