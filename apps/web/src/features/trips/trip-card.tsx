import type { MyTripCard } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatTripDates } from './trip-dates';
import styles from './trip-card.module.css';

/**
 * One of my trips: title, dates (or "N days"), places, visibility. The whole
 * card is one link to the planner.
 */
export function TripCard({ trip }: { trip: MyTripCard }) {
  const t = useTranslations('trips.card');
  const tCounts = useTranslations('common.counts');
  const locale = useLocale();
  const when =
    trip.startDate === null
      ? tCounts('days', { count: trip.dayCount })
      : formatTripDates(trip.startDate, trip.dayCount, locale);

  return (
    <Link className={styles.card} href={routes.planner(locale, trip.id)}>
      <h2 className={styles.title}>{trip.title}</h2>
      {trip.destinationName === null ? null : (
        <p className={styles.destination}>{trip.destinationName}</p>
      )}
      <p className={styles.meta}>
        {when} · {tCounts('places', { count: trip.placeCount })}
      </p>
      <p className={styles.badge} data-visibility={trip.visibility}>
        {t(`visibility.${trip.visibility}`)}
      </p>
    </Link>
  );
}
