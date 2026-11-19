'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { problemCodeOf, requestIdOf } from '@/lib/api/failure';
import { Button } from '../button/button';
import styles from './error-state.module.css';

export interface ErrorStateProps {
  /** Defaults to "Algo deu errado". */
  title?: ReactNode;
  /** What failed and what still works ("Seus lugares continuam salvos."). */
  message?: ReactNode;
  /** Retries the failed request; omitted when retrying cannot help. */
  onRetry?: () => void;
  /** What the failed request threw: its API code and request id are quoted to report it. */
  error?: unknown;
  /** Overrides the code read from `error` (a failure classified elsewhere). */
  code?: string;
  /** Overrides the request id read from `error`. */
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
  error,
  code = problemCodeOf(error) ?? undefined,
  requestId = requestIdOf(error) ?? undefined,
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
