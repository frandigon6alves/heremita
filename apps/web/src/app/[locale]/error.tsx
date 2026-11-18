'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ApiProblemError } from '@/lib/api/problem';
import { routes } from '@/lib/routes';
import { StatusPage } from './_components/status-page';
import styles from './_components/status-page.module.css';

/** A reference the user can quote: the API error code, or the server render's digest. */
function errorReference(error: unknown): string | undefined {
  if (error instanceof ApiProblemError) {
    return error.problem.code;
  }
  if (error instanceof Error && 'digest' in error && typeof error.digest === 'string') {
    return error.digest;
  }
  return undefined;
}

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const reference = errorReference(error);

  return (
    <StatusPage title={t('error.title')}>
      <p className={styles.body}>{t('error.body')}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryAction} onClick={() => retry()}>
          {t('actions.retry')}
        </button>
        <a className={styles.secondaryAction} href={routes.landing(locale)}>
          {t('notFound.home')}
        </a>
      </div>
      {reference ? (
        <p className={styles.reference}>{t('states.errorCode', { code: reference })}</p>
      ) : null}
    </StatusPage>
  );
}
