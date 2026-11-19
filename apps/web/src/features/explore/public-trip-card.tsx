import type { PublicTripCard as PublicTripCardData } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { DemoBadge } from '@/shared/components/demo-badge/demo-badge';
import { RouteThumbnail } from './route-thumbnail';
import styles from './public-trip-card.module.css';

export interface PublicTripCardProps {
  trip: PublicTripCardData;
  /** Heading level inside the page outline. */
  headingLevel?: 2 | 3;
}

/**
 * A public trip: route sketch, title (the link to the trip, covering the
 * card), mode and days, author (own link) with the demo badge, places and
 * how often it was copied.
 */
export function PublicTripCard({ trip, headingLevel = 2 }: PublicTripCardProps) {
  const t = useTranslations('explore.card');
  const tCounts = useTranslations('common.counts');
  const locale = useLocale();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <article className={styles.card}>
      <RouteThumbnail points={trip.previewPoints} />
      <Heading className={styles.title}>
        <Link className={styles.tripLink} href={routes.publicTrip(locale, trip.id)}>
          {trip.title}
        </Link>
      </Heading>
      <p className={styles.meta}>
        {[
          trip.destinationName,
          t(`modes.${trip.defaultMode}`),
          tCounts('days', { count: trip.dayCount }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className={styles.meta}>
        {t.rich('by', {
          author: () => (
            <Link className={styles.authorLink} href={routes.profile(locale, trip.author.id)}>
              {trip.author.displayName}
            </Link>
          ),
        })}{' '}
        {trip.author.isDemo ? <DemoBadge /> : null} ·{' '}
        {tCounts('places', { count: trip.placeCount })}
      </p>
      {trip.copyCount > 0 ? (
        <p className={styles.copies}>{t('copies', { count: trip.copyCount })}</p>
      ) : null}
    </article>
  );
}
