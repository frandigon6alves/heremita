import type { PublicTripCard as PublicTripCardData } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { DemoBadge } from '@/shared/components/demo-badge/demo-badge';
import { ModeIcon } from '@/shared/components/mode-icon/mode-icon';
import { TripThumbnail } from '@/shared/components/trip-thumbnail/trip-thumbnail';
import { Copy, MapPin } from '@/shared/icons/icons';
import styles from './public-trip-card.module.css';

export interface PublicTripCardProps {
  trip: PublicTripCardData;
  /** Heading level inside the page outline. */
  headingLevel?: 2 | 3;
}

/**
 * A public trip: its map (real basemap with the places as pins) with the
 * travel mode on it, title (the link to the trip, covering the card),
 * destination and days, author (own link) with the demo badge, places and
 * how often it was copied.
 */
export function PublicTripCard({ trip, headingLevel = 2 }: PublicTripCardProps) {
  const t = useTranslations('explore.card');
  const tCounts = useTranslations('common.counts');
  const locale = useLocale();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <TripThumbnail points={trip.previewPoints} />
        <span className={styles.modeChip}>
          <ModeIcon mode={trip.defaultMode} />
          {t(`modes.${trip.defaultMode}`)}
        </span>
      </div>
      <div className={styles.body}>
        <Heading className={styles.title}>
          <Link className={styles.tripLink} href={routes.publicTrip(locale, trip.id)}>
            {trip.title}
          </Link>
        </Heading>
        <p className={styles.meta}>
          <MapPin size={20} className={styles.metaIcon} />
          <span>
            {[
              trip.destinationName,
              tCounts('days', { count: trip.dayCount }),
              tCounts('places', { count: trip.placeCount }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>
        <p className={styles.byline}>
          {t.rich('by', {
            author: () => (
              <Link className={styles.authorLink} href={routes.profile(locale, trip.author.id)}>
                {trip.author.displayName}
              </Link>
            ),
          })}
          {trip.author.isDemo ? (
            <>
              {' '}
              <DemoBadge />
            </>
          ) : null}
        </p>
        {trip.copyCount > 0 ? (
          <p className={styles.copies}>
            <Copy size={20} className={styles.metaIcon} />
            <span>{t('copies', { count: trip.copyCount })}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}
