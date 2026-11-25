'use client';

import type { Page, Review } from '@heremita/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { formatYearMonth } from '@/lib/format/dates';
import { firstPageData, userReviewsQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { LoadMore } from '@/shared/components/load-more/load-more';
import { RatingStars } from '@/shared/components/rating-stars/rating-stars';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './user-review-list.module.css';

export interface UserReviewListProps {
  userId: string;
  initialPage?: Page<Review>;
}

/**
 * A traveller's reviews (E17), newest first: place (link to its page),
 * stars, visit month and text. Own hidden reviews say so.
 */
export function UserReviewList({ userId, initialPage }: UserReviewListProps) {
  const t = useTranslations('explore.profile');
  const locale = useLocale();
  const reviews = useInfiniteQuery({
    ...userReviewsQuery(userId),
    initialData: initialPage && firstPageData(initialPage),
  });

  if (reviews.isPending) {
    return (
      <Skeleton>
        <SkeletonBlock height="7rem" />
        <SkeletonBlock height="7rem" />
      </Skeleton>
    );
  }
  if (reviews.isError && reviews.data === undefined) {
    return (
      <ErrorState
        headingLevel={3}
        title={t('reviewsFailed')}
        onRetry={() => void reviews.refetch()}
        error={reviews.error}
      />
    );
  }

  const items = reviews.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return <EmptyState headingLevel={3} title={t('reviewsEmpty')} />;
  }

  return (
    <div className={styles.list}>
      <ol className={styles.items} role="list">
        {items.map((review) => (
          <li key={review.id}>
            <article className={styles.review}>
              <h3 className={styles.place}>
                <Link href={routes.place(locale, review.place.id)}>{review.place.name}</Link>
              </h3>
              <RatingStars rating={review.rating} label={t('stars', { rating: review.rating })} />
              <p className={styles.meta}>
                {t('visited', { month: formatYearMonth(review.visitedMonth, locale) })}
              </p>
              {review.status === 'hidden' ? <p className={styles.hidden}>{t('hidden')}</p> : null}
              <p className={styles.body} lang={review.language}>
                {review.body}
              </p>
            </article>
          </li>
        ))}
      </ol>
      <LoadMore pages={reviews} failedMessage={t('reviewsMoreFailed')} />
    </div>
  );
}
