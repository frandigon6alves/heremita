import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { loadFirstReviews, loadPlace, parseSort } from '@/features/reviews/load-place';
import { PlaceMap } from '@/features/reviews/place-map';
import { RatingSummary } from '@/features/reviews/rating-summary';
import { ReviewList } from '@/features/reviews/review-list';
import { WriteReviewCta } from '@/features/reviews/write-review-cta';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { routing } from '@/i18n/routing';
import styles from './place-page.module.css';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/places/[placeId]'>): Promise<Metadata> {
  const { placeId } = await params;
  const { place, rating } = await loadPlace(placeId);
  const t = await getTranslations('reviews.place');
  return {
    title: t('metaTitle', { name: place.name }),
    // A place page without any review is thin content: kept out of search engines.
    robots: { index: rating.count > 0 },
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, routes.place(locale, placeId)]),
      ),
    },
  };
}

/** Public place page (E44 + first E45 page): rating, reviews, small map, write CTA. */
export default async function PlacePage({
  params,
  searchParams,
}: PageProps<'/[locale]/places/[placeId]'>) {
  const { placeId } = await params;
  const sort = parseSort((await searchParams).sort);
  const locale = await getLocale();
  const t = await getTranslations('reviews.place');
  const tSummary = await getTranslations('reviews.summary');
  const [detail, firstPage, viewer] = await Promise.all([
    loadPlace(placeId),
    loadFirstReviews(placeId, sort),
    // API trouble while reading the session: show the page as signed out.
    getViewer().catch(() => null),
  ]);
  const { place, rating, myReview } = detail;
  const subtitle = [t(`categories.${place.category}`), place.label].filter(Boolean).join(' · ');

  return (
    <main id="main" className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>{place.name}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>
      <div className={styles.columns}>
        <aside className={styles.aside}>
          <section aria-labelledby="rating-heading" className={styles.section}>
            <h2 id="rating-heading" className={styles.sectionTitle}>
              {tSummary('heading')}
            </h2>
            <RatingSummary rating={rating} />
          </section>
          <PlaceMap
            location={place.location}
            label={t('mapLabel', { name: place.name })}
            name={place.name}
          />
        </aside>
        <section aria-labelledby="reviews-heading" className={styles.section}>
          <h2 id="reviews-heading" className={styles.sectionTitle}>
            {t('reviewsHeading')}
          </h2>
          <ReviewList
            placeId={place.id}
            reviewCount={rating.count}
            myReview={myReview}
            initialPage={firstPage === undefined ? undefined : { sort, page: firstPage }}
            signedIn={viewer !== null}
          />
        </section>
      </div>
      <WriteReviewCta href={routes.placeReview(locale, place.id)} hasReview={myReview !== null} />
    </main>
  );
}
