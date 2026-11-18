'use client';

import { useTranslations } from 'next-intl';
import type { FormLevelError } from './server-form-error';
import styles from './auth-form.module.css';

const SECONDS_PER_MINUTE = 60;

/** A failure of the whole form (not of one field), read out once it appears. */
export function FormAlert({ error }: { error: FormLevelError }) {
  const t = useTranslations('auth.errors');
  const tStates = useTranslations('common.states');

  return (
    <div className={styles.alert} role="alert">
      <p>{alertMessage(error, t)}</p>
      {error.kind === 'unexpected' && error.requestId !== null ? (
        <p className={styles.reference}>{tStates('requestId', { requestId: error.requestId })}</p>
      ) : null}
    </div>
  );
}

function alertMessage(
  error: FormLevelError,
  t: ReturnType<typeof useTranslations<'auth.errors'>>,
): string {
  switch (error.kind) {
    case 'invalidCredentials':
      return t('invalidCredentials');
    case 'offline':
      return t('offline');
    case 'unexpected':
      return t('unexpected');
    case 'tooManyAttempts': {
      const seconds = error.retryAfterSeconds;
      if (seconds === null) {
        return t('tooManyAttempts');
      }
      if (seconds < SECONDS_PER_MINUTE) {
        return t('tooManyAttemptsSeconds', { seconds });
      }
      return t('tooManyAttemptsMinutes', { minutes: Math.ceil(seconds / SECONDS_PER_MINUTE) });
    }
  }
}
