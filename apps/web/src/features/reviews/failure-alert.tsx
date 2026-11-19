import { useTranslations } from 'next-intl';
import { requestIdOf } from './failure-reference';
import styles from './failure-alert.module.css';

/** A failed submit inside a form or dialog: what went wrong + the request id to quote. */
export function FailureAlert({ message, error }: { message: string; error: unknown }) {
  const t = useTranslations('common.states');
  const requestId = requestIdOf(error);

  return (
    <div className={styles.alert} role="alert">
      <p>{message}</p>
      {requestId === null ? null : (
        <p className={styles.reference}>{t('requestId', { requestId })}</p>
      )}
    </div>
  );
}
