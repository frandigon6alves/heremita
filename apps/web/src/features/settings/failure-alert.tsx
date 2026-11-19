import { useTranslations } from 'next-intl';
import type { SubmitFailure } from './submit-failure';
import styles from './settings.module.css';

/** A failed submit of a whole form, read out once it appears, with the request id to quote. */
export function FailureAlert({
  failure,
  requestId,
}: {
  failure: SubmitFailure;
  requestId: string | null;
}) {
  const t = useTranslations('settings.failures');
  const tStates = useTranslations('common.states');

  return (
    <div className={styles.alert} role="alert">
      <p>{t(failure)}</p>
      {requestId === null ? null : (
        <p className={styles.reference}>{tStates('requestId', { requestId })}</p>
      )}
    </div>
  );
}
