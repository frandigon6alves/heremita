import { useTranslations } from 'next-intl';
import styles from './trip-form.module.css';

interface FormAlertProps {
  message: string;
  code?: string | null;
  requestId?: string | null;
}

/** A failure of the whole form or action (not of one field), read out once it appears. */
export function FormAlert({ message, code = null, requestId = null }: FormAlertProps) {
  const t = useTranslations('common.states');

  return (
    <div className={styles.alert} role="alert">
      <p>{message}</p>
      {code === null && requestId === null ? null : (
        <p className={styles.reference}>
          {code === null ? null : <span>{t('errorCode', { code })}</span>}
          {requestId === null ? null : <span>{t('requestId', { requestId })}</span>}
        </p>
      )}
    </div>
  );
}
