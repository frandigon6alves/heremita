'use client';

import type { Page, PublicTripCard } from '@heremita/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { firstPageData, exploreQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { LinkButton } from '@/shared/components/link-button/link-button';
import { PublicTripFeed } from './public-trip-feed';
import styles from './explore-results.module.css';

export interface ExploreResultsProps {
  /** Search text of `?q=` (trimmed; `''` lists every public trip). */
  q: string;
  initialPage?: Page<PublicTripCard>;
}

/** Public trips (E48) matching `q`, newest first; an empty search offers to plan it yourself. */
export function ExploreResults({ q, initialPage }: ExploreResultsProps) {
  const t = useTranslations('explore.results');
  const locale = useLocale();
  const trips = useInfiniteQuery({
    ...exploreQuery(q),
    initialData: initialPage && firstPageData(initialPage),
  });
  const planIt = (
    <LinkButton variant="primary" href={routes.newTrip(locale)}>
      {t('planIt')}
    </LinkButton>
  );

  return (
    <PublicTripFeed
      trips={trips}
      failedTitle={t('failed')}
      empty={
        q === '' ? (
          <EmptyState title={t('emptyTitle')} body={t('emptyBody')} actions={planIt} />
        ) : (
          <EmptyState
            title={t('emptyQueryTitle', { q })}
            body={t('emptyQueryBody')}
            actions={
              <>
                {planIt}
                <Link className={styles.link} href={routes.explore(locale)}>
                  {t('showAll')}
                </Link>
              </>
            }
          />
        )
      }
    />
  );
}
