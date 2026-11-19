import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { ChevronLeft } from '@/shared/icons/icons';
import { TripSettingsScreen } from './_components/trip-settings-screen';
import { loadOwnTrip } from './load-trip';
import styles from './trip-settings-page.module.css';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/trips/[tripId]/settings'>): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await loadOwnTrip(tripId);
  const t = await getTranslations('trips.settings');
  return { title: t('metaTitle', { title: trip.title }) };
}

/** Trip settings (owner only): E20 here, every change from the browser (E21–E23, E25). */
export default async function TripSettingsPage({
  params,
}: PageProps<'/[locale]/trips/[tripId]/settings'>) {
  const { tripId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('trips.settings');
  const trip = await loadOwnTrip(tripId);

  return (
    <main id="main" className={styles.main}>
      <Link className={styles.back} href={routes.planner(locale, trip.id)}>
        <ChevronLeft size={20} />
        {t('back')}
      </Link>
      <h1 className={styles.title}>{t('title')}</h1>
      <TripSettingsScreen trip={trip} />
    </main>
  );
}
