import { endpoints } from '@heremita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { classifyFailure, hasCode, type Failure } from '@/lib/api/failure';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { showToast } from '@/shared/components/toast/toast-store';

/** The trip to copy: by id (own or public trip, E25) or by share link (E28). */
export type CopySource = { tripId: string } | { shareToken: string };

/**
 * Copies a trip into my trips (private, no dates, no notes) and offers to
 * open the copy; failures are toasts with Retry. Signed in only.
 */
export function useCopyTrip(source: CopySource) {
  const t = useTranslations('trips.copy');
  const tActions = useTranslations('common.actions');
  const tFailures = useTranslations('common.failures');
  const locale = useLocale();
  const router = useRouter();
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
      if (hasCode(error, 'limit_reached')) {
        showToast({ message: t('limitReached') });
        return;
      }
      showToast({
        message: copyFailureMessage(classifyFailure(error).kind),
        action: { label: tActions('retry'), onAction: () => copy.mutate() },
      });
    },
  });
  return copy;

  function copyFailureMessage(kind: Failure['kind']): string {
    switch (kind) {
      case 'offline':
        return t('offline');
      case 'tooMany':
        return tFailures('tooMany');
      case 'failed':
        return t('failed');
    }
  }
}

export type CopyTrip = ReturnType<typeof useCopyTrip>;
