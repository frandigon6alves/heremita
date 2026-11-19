import type { UserProfile } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import { formatYearMonth } from '@/lib/format/dates';
import { DemoBadge } from '@/shared/components/demo-badge/demo-badge';
import styles from './profile-header.module.css';

/** A traveller's public profile: name (+ demo badge), member since, what they shared. */
export function ProfileHeader({ profile }: { profile: UserProfile }) {
  const t = useTranslations('explore.profile');
  const locale = useLocale();

  return (
    <header className={styles.header}>
      <h1 className={styles.name}>
        {profile.displayName} {profile.isDemo ? <DemoBadge /> : null}
      </h1>
      <p className={styles.meta}>
        {t('memberSince', { month: formatYearMonth(profile.joinedMonth, locale) })}
      </p>
      <p className={styles.meta}>
        {t('trips', { count: profile.publicTripCount })} ·{' '}
        {t('reviews', { count: profile.reviewCount })}
      </p>
    </header>
  );
}
