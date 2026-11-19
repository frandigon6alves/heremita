'use client';

import { endpoints } from '@heremita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { showToast } from '@/shared/components/toast/toast-store';
import { useOnline } from '@/shared/hooks/use-online';
import { Copy } from '@/shared/icons/icons';
import { submitFailure } from './submit-failure';

/** The trip to copy: by id (own or public trip, E25) or by share link (E28). */
export type CopySource = { tripId: string } | { shareToken: string };

export interface CopyTripButtonProps {
  source: CopySource;
  /** "Duplicar" on my own trip, "Copiar para minhas viagens" elsewhere. */
  label: string;
}

/**
 * Copies a trip into my trips (private, no dates, no notes) and offers to
 * open the copy. Signed in only: the caller handles signed-out viewers.
 */
export function CopyTripButton({ source, label }: CopyTripButtonProps) {
  const t = useTranslations('trips.copy');
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  const router = useRouter();
  const online = useOnline();
  const queryClient = useQueryClient();
  const copy = useMutation({
    mutationFn: () =>
      'tripId' in source
        ? apiFetch(endpoints.copyTrip, { params: { tripId: source.tripId }, body: {} })
        : apiFetch(endpoints.copySharedTrip, {
            params: { shareToken: source.shareToken },
            body: {},
          }),
    onSuccess: async (created) => {
      showToast({
        message: t('done', { title: created.title }),
        action: {
          label: t('open'),
          onAction: () => router.push(routes.planner(locale, created.id)),
        },
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.mine });
    },
    onError: (error) => {
      const failure = submitFailure(error);
      if (failure.kind === 'limit') {
        showToast({ message: t('limitReached') });
        return;
      }
      showToast({
        message: failure.kind === 'offline' ? t('offline') : t('failed'),
        action: { label: tActions('retry'), onAction: () => copy.mutate() },
      });
    },
  });

  return (
    <Button busy={copy.isPending} disabled={!online} onClick={() => copy.mutate()}>
      <Copy size={20} />
      {copy.isPending ? t('copying') : label}
    </Button>
  );
}
