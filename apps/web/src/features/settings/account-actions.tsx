'use client';

import { apiRoutes } from '@heremita/shared/api-routes';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api/client';
import { isUnauthenticated } from '@/lib/api/problem';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { showToast } from '@/shared/components/toast/toast-store';
import { clearDrafts } from '@/shared/storage/session-drafts';
import { DeleteAccountDialog } from './delete-account-dialog';
import styles from './settings.module.css';

export interface AccountActionsProps {
  /** "Log out" of this device (the auth feature's button), composed by the page. */
  logOut: ReactNode;
}

/**
 * Leaving: log out here, log out everywhere (E7), and, apart from them,
 * delete the account. Logging out everywhere goes through `apiFetch`, not a
 * mutation, so a session that already ended counts as logged out instead of
 * sending the viewer to log-in.
 */
export function AccountActions({ logOut }: AccountActionsProps) {
  const t = useTranslations('settings.account');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const everywhereHintId = useId();
  const deleteHintId = useId();

  const logOutEverywhere = async () => {
    setLoggingOut(true);
    try {
      await apiFetch(apiRoutes.logOutEverywhere);
    } catch (error) {
      if (!isUnauthenticated(error)) {
        setLoggingOut(false);
        showToast({ message: t('logOutEverywhereFailed') });
        return;
      }
    }
    queryClient.clear();
    clearDrafts();
    router.replace(routes.landing(locale));
    router.refresh();
  };

  return (
    <div className={styles.accountActions}>
      <div className={styles.accountAction}>
        {logOut}
        <p className={styles.note}>{t('logOutHint')}</p>
      </div>
      <div className={styles.accountAction}>
        <Button
          busy={loggingOut}
          aria-describedby={everywhereHintId}
          onClick={() => void logOutEverywhere()}
        >
          {loggingOut ? t('loggingOutEverywhere') : t('logOutEverywhere')}
        </Button>
        <p id={everywhereHintId} className={styles.note}>
          {t('logOutEverywhereHint')}
        </p>
      </div>
      <div className={`${styles.accountAction} ${styles.danger}`}>
        <Button variant="danger" aria-describedby={deleteHintId} onClick={() => setDeleting(true)}>
          {t('delete')}
        </Button>
        <p id={deleteHintId} className={styles.note}>
          {t('deleteHint')}
        </p>
      </div>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </div>
  );
}
