'use client';

import type { Page, Review } from '@heremita/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ApiProblemError, HttpError } from '@/lib/api/problem';
import { formatYearMonth } from '@/lib/format/dates';
import { userReviewsQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { RatingStars } from '@/shared/components/rating-stars/rating-stars';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './user-reviews.module.css';

function requestIdOf(error: unknown): string | undefined {
  return error instanceof ApiProblemError || error instanceof HttpError
    ? (error.requestId ?? undefined)
    : undefined;
}

export interface UserReviewsProps {
  userId: string;
  initialPage?: Page<Review>;
}

/**
 * A traveller's reviews (E17), newest first: place (link to its page),
 * stars, visit month and text. Own hidden reviews say so.
 */
export function UserReviews({ userId, initialPage }: UserReviewsProps) {
  const t = useTranslations('explore.profile');
  const tStates = useTranslations('common.states');
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  const reviews = useInfiniteQuery({
    ...userReviewsQuery(userId),
    initialData: initialPage && { pages: [initialPage], pageParams: [null] },
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
        code={reviews.error instanceof ApiProblemError ? reviews.error.code : undefined}
        requestId={requestIdOf(reviews.error)}
      />
    );
  }

  const items = reviews.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return <EmptyState headingLevel={3} title={t('reviewsEmpty')} />;
  }
  const moreRequestId = reviews.isFetchNextPageError ? requestIdOf(reviews.error) : undefined;

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
              <p className={styles.body}>{review.body}</p>
            </article>
          </li>
        ))}
      </ol>
      {reviews.isFetchNextPageError ? (
        <p className={styles.alert} role="alert">
          {t('reviewsMoreFailed')}{' '}
          {moreRequestId === undefined ? null : (
            <span className={styles.reference}>
              {tStates('requestId', { requestId: moreRequestId })}
            </span>
          )}
        </p>
      ) : null}
      {reviews.hasNextPage ? (
        <Button
          className={styles.more}
          busy={reviews.isFetchingNextPage}
          onClick={() => void reviews.fetchNextPage()}
        >
          {tActions('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
