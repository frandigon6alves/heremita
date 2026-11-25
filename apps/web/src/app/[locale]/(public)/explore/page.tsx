import { apiRoutes } from '@heremita/shared/api-routes';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExploreResults } from '@/features/explore/explore-results';
import { ExploreSearch } from '@/features/explore/explore-search';
import { serverFetch } from '@/lib/api/server';
import { localeAlternates, routes } from '@/lib/routes';
import { Compass } from '@/shared/icons/icons';
import { searchText } from './search-text';
import styles from './explore-page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('explore.explore');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { languages: localeAlternates((locale) => routes.explore(locale)) },
  };
}

/** Public trips (E48), searchable by `?q=`; first page here, "Load more" in the browser. */
export default async function ExplorePage({ searchParams }: PageProps<'/[locale]/explore'>) {
  const q = searchText((await searchParams).q);
  const t = await getTranslations('explore.explore');
  // A failed first page is not fatal: the results fetch it again and show their own error state.
  const firstPage = await serverFetch(apiRoutes.listPublicTrips, {
    query: { q: q === '' ? undefined : q },
  }).catch(() => undefined);

  return (
    <main id="main" className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.titleIcon}>
            <Compass />
          </span>
          {t('title')}
        </h1>
        <p className={styles.lead}>{t('lead')}</p>
      </header>
      <ExploreSearch key={q} q={q} />
      <ExploreResults q={q} initialPage={firstPage} />
    </main>
  );
}
