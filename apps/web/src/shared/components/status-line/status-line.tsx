'use client';

import { useTranslations } from 'next-intl';
import { Spinner } from '../spinner/spinner';
import styles from './status-line.module.css';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Inline save status next to an autosaving control: "Salvando…", "Salvo",
 * "Não salvo". Not a live region: a failed save also raises a toast with
 * Retry, which the app's single live region reads out.
 */
export function StatusLine({ status }: { status: SaveStatus }) {
  const t = useTranslations('common.status');

  return (
    <span
      className={status === 'error' ? `${styles.statusLine} ${styles.error}` : styles.statusLine}
    >
      {status === 'saving' ? <Spinner size={16} /> : null}
      {status === 'saving' ? t('saving') : null}
      {status === 'saved' ? t('saved') : null}
      {status === 'error' ? t('notSaved') : null}
    </span>
  );
}
