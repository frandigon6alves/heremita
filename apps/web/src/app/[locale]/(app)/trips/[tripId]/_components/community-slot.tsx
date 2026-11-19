import type { Locale, TripPlaceOwner } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { RatingSummary } from '@/features/reviews/rating-summary';
import { routes } from '@/lib/routes';
import styles from './planner-screen.module.css';

/** What other travellers say about a map place; custom pins have no public page. */
export function CommunitySlot({
  place,
  locale,
}: {
  place: Pick<TripPlaceOwner, 'place' | 'rating'>;
  locale: Locale;
}) {
  const t = useTranslations('itinerary.card');

  if (place.place.source !== 'osm') {
    return null;
  }
  return (
    <div className={styles.community}>
      <RatingSummary rating={place.rating} />
      <Link className={styles.textLink} href={routes.place(locale, place.place.id)}>
        {t('seeReviews')}
      </Link>
    </div>
  );
}
