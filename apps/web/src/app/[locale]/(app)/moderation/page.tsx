import { apiRoutes } from '@heremita/shared/api-routes';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ModerationQueue } from '@/features/reviews/moderation-queue';
import { getViewer, serverFetch } from '@/lib/api/server';
import styles from './moderation-page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reviews.moderation');
  return { title: t('metaTitle') };
}

/** Report queue (E50 + E51), moderators only: anyone else gets the 404 page, not a hint it exists. */
export default async function ModerationPage() {
  const viewer = await getViewer();
  if (viewer?.role !== 'moderator') {
    notFound();
  }
  const t = await getTranslations('reviews.moderation');
  // A failure here leaves the queue to fetch (and explain) in the browser.
  const firstPage = await serverFetch(apiRoutes.listReports, { query: { status: 'open' } }).catch(
    () => undefined,
  );

  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.intro}>{t('intro')}</p>
      <ModerationQueue initialOpenPage={firstPage} />
    </main>
  );
}
