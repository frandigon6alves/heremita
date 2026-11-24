import type { MyTripCard, Visibility } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { routes } from '@/lib/routes';
import { TripThumbnail } from '@/shared/components/trip-thumbnail/trip-thumbnail';
import type { IconProps } from '@/shared/icons/icon';
import { CalendarDays, Globe, Link as LinkIcon, Lock, MapPin } from '@/shared/icons/icons';
import { formatTripDates } from './trip-dates';
import styles from './trip-card.module.css';

const VISIBILITY_ICONS: Record<Visibility, ComponentType<IconProps>> = {
  private: Lock,
  link: LinkIcon,
  public: Globe,
};

/**
 * One of my trips: its map with the visibility badge on it, title,
 * destination, dates (or "N days") and places. The whole card is one link
 * to the planner.
 */
export function TripCard({ trip }: { trip: MyTripCard }) {
  const t = useTranslations('trips.card');
  const tCounts = useTranslations('common.counts');
  const locale = useLocale();
  const when =
    trip.startDate === null
      ? tCounts('days', { count: trip.dayCount })
      : formatTripDates(trip.startDate, trip.dayCount, locale);
  const VisibilityIcon = VISIBILITY_ICONS[trip.visibility];

  return (
    // The text comes first in the DOM, so the link's name starts with the title; CSS puts the map on top.
    <Link className={styles.card} href={routes.planner(locale, trip.id)}>
      <div className={styles.body}>
        <h2 className={styles.title}>{trip.title}</h2>
        {trip.destinationName === null ? null : (
          <p className={styles.meta}>
            <MapPin size={20} className={styles.metaIcon} />
            <span>{trip.destinationName}</span>
          </p>
        )}
        <p className={styles.meta}>
          <CalendarDays size={20} className={styles.metaIcon} />
          <span>
            {when} · {tCounts('places', { count: trip.placeCount })}
          </span>
        </p>
      </div>
      <div className={styles.media}>
        <TripThumbnail points={trip.previewPoints} />
        <span className={styles.badge} data-visibility={trip.visibility}>
          <VisibilityIcon size={20} />
          {t(`visibility.${trip.visibility}`)}
        </span>
      </div>
    </Link>
  );
}
