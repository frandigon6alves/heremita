'use client';

import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import styles from './load-more.module.css';

export interface LoadMoreProps {
  /** The list's infinite query. */
  pages: Pick<
    UseInfiniteQueryResult,
    'error' | 'isFetchNextPageError' | 'hasNextPage' | 'isFetchingNextPage' | 'fetchNextPage'
  >;
  /** Alert text when the next page failed. */
  failedMessage: string;
}

/**
 * The foot of a paged list (never infinite scroll): the alert of a failed next
 * page and the "Load more" button while pages remain. Rendered as two siblings
 * so they sit in the list's own grid.
 */
export function LoadMore({ pages, failedMessage }: LoadMoreProps) {
  const tActions = useTranslations('common.actions');

  return (
    <>
      {pages.isFetchNextPageError ? (
        <FormAlert error={pages.error} message={failedMessage} />
      ) : null}
      {pages.hasNextPage ? (
        <Button
          className={styles.button}
          busy={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
        >
          {tActions('loadMore')}
        </Button>
      ) : null}
    </>
  );
}
