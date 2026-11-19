'use client';

import type { TripOwner } from '@heremita/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { tripQuery } from '@/lib/api/query-keys';
import { CopyTripButton } from './copy-trip-button';
import { DeleteTripButton } from './delete-trip-button';
import type { DestinationPicker } from './destination';
import { ShareLink } from './share-link';
import { TripDetailsForm } from './trip-details-form';
import { VisibilitySettings } from './visibility-settings';
import styles from './trip-settings.module.css';

export interface TripSettingsProps {
  /** E20 as the server rendered it (owner shape). */
  initialTrip: TripOwner;
  renderDestination: (picker: DestinationPicker & { label: string }) => ReactNode;
}

/**
 * Trip settings sections: details, visibility + share link, duplicate, and
 * the danger zone (delete) last, far from the save button.
 */
export function TripSettings({ initialTrip, renderDestination }: TripSettingsProps) {
  const t = useTranslations('trips.settings');
  const { data } = useQuery({ ...tripQuery(initialTrip.id), initialData: initialTrip });
  // Only the owner reaches this page; a viewer shape would mean the cache changed hands.
  const trip = data.viewerRole === 'owner' ? data : initialTrip;

  return (
    <div className={styles.sections}>
      <section aria-labelledby="details-heading" className={styles.section}>
        <h2 id="details-heading" className={styles.heading}>
          {t('details.heading')}
        </h2>
        <TripDetailsForm trip={trip} renderDestination={renderDestination} />
      </section>
      <section aria-labelledby="sharing-heading" className={styles.section}>
        <h2 id="sharing-heading" className={styles.heading}>
          {t('sharingHeading')}
        </h2>
        <VisibilitySettings trip={trip} />
        {trip.visibility !== 'private' && trip.shareToken !== null ? (
          <ShareLink trip={trip} shareToken={trip.shareToken} />
        ) : null}
      </section>
      <section aria-labelledby="duplicate-heading" className={styles.section}>
        <h2 id="duplicate-heading" className={styles.heading}>
          {t('duplicate.heading')}
        </h2>
        <p className={styles.note}>{t('duplicate.body')}</p>
        <div className={styles.buttons}>
          <CopyTripButton source={{ tripId: trip.id }} label={t('duplicate.button')} />
        </div>
      </section>
      <section aria-labelledby="danger-heading" className={`${styles.section} ${styles.danger}`}>
        <h2 id="danger-heading" className={styles.heading}>
          {t('danger.heading')}
        </h2>
        <p className={styles.note}>{t('danger.body')}</p>
        <div className={styles.buttons}>
          <DeleteTripButton tripId={trip.id} title={trip.title} />
        </div>
      </section>
    </div>
  );
}
