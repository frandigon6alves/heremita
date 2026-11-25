'use client';

import type { Review } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { formatYearMonth } from '@/lib/format/dates';
import { routes } from '@/lib/routes';
import { DemoBadge } from '@/shared/components/demo-badge/demo-badge';
import { PopoverMenu } from '@/shared/components/popover-menu/popover-menu';
import { RatingStars } from '@/shared/components/rating-stars/rating-stars';
import { Ellipsis } from '@/shared/icons/icons';
import { BlockUserDialog } from './block-user-dialog';
import { LazyReportDialog } from './lazy-report-dialog';
import styles from './review-item.module.css';

export interface ReviewItemProps {
  review: Review;
  /** Signed-out viewers get the same menu, leading to log-in first. */
  signedIn: boolean;
}

type OpenDialog = 'report' | 'block' | null;

/**
 * One review: author (+ demo badge), visit month, stars, text. Other people's
 * reviews have a ⋯ menu with Report and Block user (signed out: log in
 * first, then back here); the dialogs live outside the menu's popover so
 * closing it does not hide them.
 */
export function ReviewItem({ review, signedIn }: ReviewItemProps) {
  const t = useTranslations('reviews.item');
  const locale = useLocale();
  const headingId = useId();
  const router = useRouter();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // Mounted on the first "Block" only: a long list of reviews holds no idle dialogs.
  const [blockMounted, setBlockMounted] = useState(false);
  if (dialog === 'block' && !blockMounted) {
    setBlockMounted(true);
  }
  const { author } = review;

  function act(next: Exclude<OpenDialog, null>) {
    if (signedIn) {
      setDialog(next);
    } else {
      router.push(routes.login(locale, { next: routes.place(locale, review.place.id) }));
    }
  }

  return (
    <article className={styles.item} aria-labelledby={headingId}>
      <header className={styles.header}>
        <p className={styles.byline}>
          <Link id={headingId} className={styles.author} href={routes.profile(locale, author.id)}>
            {author.displayName}
          </Link>
          {author.isDemo ? <DemoBadge /> : null}
          {review.isMine ? <span className={styles.badge}>{t('mine')}</span> : null}
        </p>
        {review.isMine ? null : (
          <PopoverMenu
            trigger={<Ellipsis size={20} />}
            label={t('actions', { name: author.displayName })}
            sections={[
              {
                items: [
                  { id: 'report', label: t('report'), onSelect: () => act('report') },
                  { id: 'block', label: t('block'), onSelect: () => act('block') },
                ],
              },
            ]}
          />
        )}
      </header>
      <p className={styles.meta}>
        <RatingStars rating={review.rating} label={t('stars', { rating: review.rating })} />
        <span>{t('visited', { month: formatYearMonth(review.visitedMonth, locale) })}</span>
      </p>
      {review.status === 'hidden' ? <p className={styles.hidden}>{t('hidden')}</p> : null}
      <p className={styles.body} lang={review.language}>
        {review.body}
      </p>
      {signedIn && !review.isMine ? (
        <>
          <LazyReportDialog
            open={dialog === 'report'}
            onClose={() => setDialog(null)}
            target={{ type: 'review', id: review.id }}
          />
          {blockMounted ? (
            <BlockUserDialog
              open={dialog === 'block'}
              onClose={() => setDialog(null)}
              user={author}
            />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
