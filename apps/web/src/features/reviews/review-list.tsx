'use client';

import type { Page, Review, ReviewSort } from '@heremita/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { firstPageData, placeReviewsQuery } from '@/lib/api/query-keys';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { LoadMore } from '@/shared/components/load-more/load-more';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { ReviewItem } from './review-item';
import { useReviewSort } from './use-review-sort';
import styles from './review-list.module.css';

const SORTS: readonly ReviewSort[] = ['recent', 'lowest'];

export interface ReviewListProps {
  placeId: string;
  /** Published reviews of the place (rating summary); 0 → the summary already invites to write one. */
  reviewCount: number;
  /** The viewer's own review, always listed first. */
  myReview: Review | null;
  /** First page rendered on the server for `initialSort`. */
  initialPage?: { sort: ReviewSort; page: Page<Review> };
  signedIn: boolean;
}

/** Reviews of a place (E45): sort recent | lowest (`?sort=`), own review first, "Load more". */
export function ReviewList({
  placeId,
  reviewCount,
  myReview,
  initialPage,
  signedIn,
}: ReviewListProps) {
  const t = useTranslations('reviews.list');
  const [sort, setSort] = useReviewSort();
  const reviews = useInfiniteQuery({
    ...placeReviewsQuery(placeId, sort),
    initialData: initialPage?.sort === sort ? firstPageData(initialPage.page) : undefined,
  });

  if (reviewCount === 0 && myReview === null) {
    return null;
  }

  const others =
    reviews.data?.pages.flatMap((page) => page.items).filter((review) => !review.isMine) ?? [];
  const listed = myReview === null ? others : [myReview, ...others];

  return (
    <div className={styles.list}>
      <SegmentedControl
        legend={t('sort')}
        options={SORTS.map((value) => ({ value, label: t(value) }))}
        value={sort}
        onChange={(value) => void setSort(value)}
      />
      {content()}
    </div>
  );

  function content() {
    if (reviews.isPending) {
      return (
        <Skeleton>
          <SkeletonBlock height="7rem" />
          <SkeletonBlock height="7rem" />
          <SkeletonBlock height="7rem" />
        </Skeleton>
      );
    }
    if (reviews.isError && reviews.data === undefined) {
      return (
        <ErrorState
          headingLevel={3}
          title={t('failed')}
          onRetry={() => void reviews.refetch()}
          error={reviews.error}
        />
      );
    }
    if (listed.length === 0) {
      return <EmptyState headingLevel={3} title={t('empty')} />;
    }
    return (
      <>
        <ol className={styles.items} role="list">
          {listed.map((review) => (
            <li key={review.id}>
              <ReviewItem review={review} signedIn={signedIn} />
            </li>
          ))}
        </ol>
        <LoadMore pages={reviews} failedMessage={t('moreFailed')} />
      </>
    );
  }
}
