'use client';

import { useTranslations } from 'next-intl';
import { classifyFailure, problemCodeOf, requestIdOf, type Failure } from '@/lib/api/failure';
import styles from './form-alert.module.css';

const SECONDS_PER_MINUTE = 60;

export interface FormAlertProps {
  /** What the failed call threw. */
  error: unknown;
  /** What failed, for any failure other than "offline" and "too many"; defaults to "Something went wrong". */
  message?: string;
  /** Replaces the generic offline message when the form has more to say ("your text is still here"). */
  offlineMessage?: string;
}

/**
 * A failure of a whole form or action (not of one field), read out once it
 * appears, with the API code and request id to report it (V58).
 */
export function FormAlert({ error, message, offlineMessage }: FormAlertProps) {
  const t = useTranslations('common');
  const code = problemCodeOf(error);
  const requestId = requestIdOf(error);

  return (
    <div className={styles.alert} role="alert">
      <p>{text(classifyFailure(error))}</p>
      {code === null && requestId === null ? null : (
        <p className={styles.reference}>
          {code === null ? null : <span>{t('states.errorCode', { code })}</span>}
          {requestId === null ? null : <span>{t('states.requestId', { requestId })}</span>}
        </p>
      )}
    </div>
  );

  function text(failure: Failure): string {
    switch (failure.kind) {
      case 'offline':
        return offlineMessage ?? t('failures.offline');
      case 'failed':
        return message ?? t('failures.failed');
      case 'tooMany': {
        const seconds = failure.retryAfterSeconds;
        if (seconds === null) {
          return t('failures.tooMany');
        }
        if (seconds < SECONDS_PER_MINUTE) {
          return t('failures.tooManySeconds', { seconds });
        }
        return t('failures.tooManyMinutes', {
          minutes: Math.ceil(seconds / SECONDS_PER_MINUTE),
        });
      }
    }
  }
}
