import { getLocale, getTranslations } from 'next-intl/server';
import { routes } from '@/lib/routes';
import { LinkButton } from '@/shared/components/link-button/link-button';
import { Compass } from '@/shared/icons/icons';
import { StatusPage } from './_components/status-page';
import styles from './_components/status-page.module.css';

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations('common.notFound');

  return (
    <StatusPage title={t('title')} icon={<Compass />}>
      <p className={styles.body}>{t('body')}</p>
      <div className={styles.actions}>
        <LinkButton variant="primary" size="large" href={routes.landing(locale)}>
          {t('home')}
        </LinkButton>
      </div>
    </StatusPage>
  );
}
