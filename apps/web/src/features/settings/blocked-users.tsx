'use client';

import { endpoints, type UserCard } from '@heremita/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { myBlocksQuery, queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { DemoBadge } from '@/shared/components/demo-badge/demo-badge';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { showToast } from '@/shared/components/toast/toast-store';
import styles from './settings.module.css';

/**
 * People the viewer blocked (E12), newest first, each with "Unblock" (E14).
 * Unblocking brings their reviews and public trips back, so every cached
 * place and explore list is refetched.
 */
export function BlockedUsers() {
  const t = useTranslations('settings.blocked');
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const blocks = useInfiniteQuery(myBlocksQuery());

  const unblock = useMutation({
    mutationFn: (person: UserCard) =>
      apiFetch(endpoints.unblockUser, { params: { userId: person.id } }),
    onSuccess: async (_result, person) => {
      showToast({ message: t('unblocked', { name: person.displayName }) });
      await Promise.all(
        [queryKeys.me.blocks, queryKeys.places.all, queryKeys.explore.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (_error, person) => {
      showToast({
        message: t('unblockFailed', { name: person.displayName }),
        action: { label: tActions('retry'), onAction: () => unblock.mutate(person) },
      });
    },
  });

  if (blocks.isPending) {
    return (
      <Skeleton>
        <SkeletonBlock height="var(--target-min)" />
        <SkeletonBlock height="var(--target-min)" />
        <SkeletonBlock height="var(--target-min)" />
      </Skeleton>
    );
  }
  if (blocks.isLoadingError) {
    return (
      <ErrorState
        headingLevel={3}
        title={t('loadFailed')}
        onRetry={() => void blocks.refetch()}
        error={blocks.error}
      />
    );
  }

  const people = blocks.data.pages.flatMap((page) => page.items);
  if (people.length === 0) {
    return <EmptyState headingLevel={3} title={t('emptyTitle')} body={t('emptyBody')} />;
  }

  return (
    <div className={styles.blocked}>
      <ul className={styles.blockList} aria-label={t('listLabel')}>
        {people.map((person) => {
          const pending = unblock.isPending && unblock.variables.id === person.id;
          return (
            <li key={person.id} className={styles.blockRow}>
              <span className={styles.person}>
                <Link className={styles.personLink} href={routes.profile(locale, person.id)}>
                  {person.displayName}
                </Link>
                {person.isDemo ? <DemoBadge /> : null}
              </span>
              <Button
                aria-label={t('unblockLabel', { name: person.displayName })}
                busy={pending}
                onClick={() => unblock.mutate(person)}
              >
                {t('unblock')}
              </Button>
            </li>
          );
        })}
      </ul>
      {blocks.isFetchNextPageError ? (
        <FormAlert error={blocks.error} message={t('loadMoreFailed')} />
      ) : null}
      {blocks.hasNextPage ? (
        <Button busy={blocks.isFetchingNextPage} onClick={() => void blocks.fetchNextPage()}>
          {tActions('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
