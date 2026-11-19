import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileHeader } from '@/features/explore/profile-header';
import { UserTrips } from '@/features/explore/user-trips';
import { UserReviewList } from '@/features/reviews/user-review-list';
import { routes } from '@/lib/routes';
import { routing } from '@/i18n/routing';
import { loadFirstPages, loadProfile } from './load-profile';
import styles from './profile-page.module.css';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/u/[userId]'>): Promise<Metadata> {
  const { userId } = await params;
  const profile = await loadProfile(userId);
  return {
    title: profile.displayName,
    // A profile with nothing public is thin content: kept out of search engines.
    robots: { index: profile.publicTripCount + profile.reviewCount > 0 },
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, routes.profile(locale, userId)]),
      ),
    },
  };
}

/** Public profile (E15) with the traveller's public trips (E16) and reviews (E17). */
export default async function ProfilePage({ params }: PageProps<'/[locale]/u/[userId]'>) {
  const { userId } = await params;
  const t = await getTranslations('explore.profile');
  const [profile, firstPages] = await Promise.all([loadProfile(userId), loadFirstPages(userId)]);

  return (
    <main id="main" className={styles.main}>
      <ProfileHeader profile={profile} />
      <section aria-labelledby="trips-heading" className={styles.section}>
        <h2 id="trips-heading" className={styles.sectionTitle}>
          {t('tripsHeading')}
        </h2>
        <UserTrips userId={profile.id} initialPage={firstPages.trips} />
      </section>
      <section aria-labelledby="reviews-heading" className={styles.section}>
        <h2 id="reviews-heading" className={styles.sectionTitle}>
          {t('reviewsHeading')}
        </h2>
        <UserReviewList userId={profile.id} initialPage={firstPages.reviews} />
      </section>
    </main>
  );
}
