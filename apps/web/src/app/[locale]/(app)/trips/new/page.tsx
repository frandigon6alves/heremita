import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { ChevronLeft } from '@/shared/icons/icons';
import { NewTripForm } from './_components/new-trip-form';
import styles from './new-trip-page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trips.new');
  return { title: t('metaTitle') };
}

/** Create a trip (E19 from the browser), then open it in the planner. */
export default async function NewTripPage() {
  const locale = await getLocale();
  const t = await getTranslations('trips.new');

  return (
    <main id="main" className={styles.main}>
      <Link className={styles.back} href={routes.trips(locale)}>
        <ChevronLeft size={20} />
        {t('back')}
      </Link>
      <h1 className={styles.title}>{t('title')}</h1>
      <NewTripForm />
    </main>
  );
}
