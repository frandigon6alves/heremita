'use client';

import { useTranslations } from 'next-intl';
import styles from './offline-banner.module.css';

/**
 * "Você está offline" bar shown under the app bar while the browser is
 * offline; edit controls are disabled meanwhile (no silent mutation queue).
 * The caller passes `online` from `useOnline()`.
 */
export function OfflineBanner({ online }: { online: boolean }) {
  const t = useTranslations('common');

  if (online) {
    return null;
  }
  return <p className={styles.banner}>{t('offline')}</p>;
}
