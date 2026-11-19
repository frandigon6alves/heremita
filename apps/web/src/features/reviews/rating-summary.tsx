import type { RatingSummary as Rating } from '@heremita/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { VisuallyHidden } from '@/shared/components/visually-hidden/visually-hidden';
import styles from './rating-summary.module.css';

/** Star values of the distribution bars, top to bottom. */
const STARS = [5, 4, 3, 2, 1] as const;

/**
 * A place's rating. The API sends the average and the distribution only from
 * 6 published reviews on (V48): below that only the count is shown, never an
 * average of a handful of opinions; with none, an invitation to write one.
 */
export function RatingSummary({ rating }: { rating: Rating }) {
  const t = useTranslations('reviews.summary');
  const format = useFormatter();
  const { count, average, distribution } = rating;

  if (count === 0) {
    return <p className={styles.none}>{t('none')}</p>;
  }
  if (average === null || distribution === null) {
    return <p className={styles.count}>{t('count', { count })}</p>;
  }

  const shown = format.number(average, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const largest = Math.max(...distribution);
  return (
    <div className={styles.summary}>
      <p className={styles.headline}>
        <span className={styles.average} aria-hidden="true">
          {t('average', { average: shown })}
        </span>
        <VisuallyHidden>{t('averageLabel', { average: shown })}</VisuallyHidden>{' '}
        <span className={styles.count}>{t('count', { count })}</span>
      </p>
      <ul className={styles.bars} aria-label={t('distribution')} role="list">
        {STARS.map((stars) => {
          const starCount = distribution[stars - 1] ?? 0;
          return (
            <li key={stars} className={styles.bar}>
              <span className={styles.barLabel}>{t('bar', { stars, count: starCount })}</span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.fill}
                  style={{ inlineSize: `${largest === 0 ? 0 : (starCount / largest) * 100}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
