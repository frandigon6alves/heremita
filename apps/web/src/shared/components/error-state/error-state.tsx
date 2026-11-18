'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '../button/button';
import styles from './error-state.module.css';

export interface ErrorStateProps {
  /** Defaults to "Algo deu errado". */
  title?: ReactNode;
  /** What failed and what still works ("Seus lugares continuam salvos."). */
  message?: ReactNode;
  /** Retries the failed request; omitted when retrying cannot help. */
  onRetry?: () => void;
  /** Stable API error code (`ProblemDetails.code`), quoted to the operator. */
  code?: string;
  /** `X-Request-Id` of the failed response, to find it in the API logs. */
  requestId?: string;
  headingLevel?: 2 | 3;
}

/**
 * Error state scoped to the region that failed (the rest of the screen keeps
 * working): message, Retry, and the code + request id to report it.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  code,
  requestId,
  headingLevel = 2,
}: ErrorStateProps) {
  const t = useTranslations('common');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <div className={styles.errorState}>
      <Heading className={styles.title}>{title ?? t('states.errorTitle')}</Heading>
      {message ? <p className={styles.message}>{message}</p> : null}
      {onRetry ? <Button onClick={onRetry}>{t('actions.retry')}</Button> : null}
      {code || requestId ? (
        <p className={styles.reference}>
          {code ? <span>{t('states.errorCode', { code })}</span> : null}
          {requestId ? <span>{t('states.requestId', { requestId })}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
