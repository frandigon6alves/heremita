import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { loadPlace } from '@/features/reviews/load-place';
import { ReviewForm } from '@/features/reviews/review-form';
import { routes } from '@/lib/routes';
import { ChevronLeft } from '@/shared/icons/icons';
import styles from './review-page.module.css';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/places/[placeId]/review'>): Promise<Metadata> {
  const { placeId } = await params;
  const { place } = await loadPlace(placeId);
  const t = await getTranslations('reviews.form');
  return { title: t('metaTitle', { name: place.name }) };
}

/** Write or edit the viewer's review of a place (E44 prefill → E46/E47 from the browser). */
export default async function PlaceReviewPage({
  params,
}: PageProps<'/[locale]/places/[placeId]/review'>) {
  const { placeId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('reviews.form');
  const { place, myReview } = await loadPlace(placeId);
  // The visit month may be this month at most; the API checks it again with its own clock.
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <main id="main" className={styles.main}>
      <Link className={styles.back} href={routes.place(locale, place.id)}>
        <ChevronLeft size={20} />
        {t('back', { name: place.name })}
      </Link>
      <h1 className={styles.title}>
        {myReview === null
          ? t('titleNew', { name: place.name })
          : t('titleEdit', { name: place.name })}
      </h1>
      <ReviewForm placeId={place.id} myReview={myReview} currentMonth={currentMonth} />
    </main>
  );
}
