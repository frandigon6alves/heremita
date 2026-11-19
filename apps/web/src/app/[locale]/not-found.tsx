import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { StatusPage } from './_components/status-page';
import styles from './_components/status-page.module.css';

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations('common.notFound');

  return (
    <StatusPage title={t('title')}>
      <p className={styles.body}>{t('body')}</p>
      <div className={styles.actions}>
        <Link className={styles.primaryAction} href={routes.landing(locale)}>
          {t('home')}
        </Link>
      </div>
    </StatusPage>
  );
}
