'use client';

import { apiRoutes } from '@heremita/shared/api-routes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { ConfirmDialog } from '@/shared/components/dialog/confirm-dialog';
import { showToast } from '@/shared/components/toast/toast-store';
import { useOnline } from '@/shared/hooks/use-online';
import { Trash } from '@/shared/icons/icons';

/**
 * "Excluir viagem" with a confirmation dialog (E22 cannot be undone: days,
 * places, notes and the share link go with it). Success → My trips.
 */
export function DeleteTripButton({ tripId, title }: { tripId: string; title: string }) {
  const t = useTranslations('trips.delete');
  const locale = useLocale();
  const router = useRouter();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => apiFetch(apiRoutes.deleteTrip, { params: { tripId } }),
    onSuccess: async () => {
      showToast({ message: t('done', { title }) });
      router.replace(routes.trips(locale));
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.mine });
    },
  });

  return (
    <>
      <Button
        disabled={!online}
        onClick={() => {
          remove.reset();
          setConfirming(true);
        }}
      >
        <Trash size={20} />
        {t('button')}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('title', { title })}
        confirmLabel={t('confirm')}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending || remove.isSuccess}
      >
        <p>{t('body')}</p>
        {remove.isError ? (
          <FormAlert error={remove.error} message={t('failed')} offlineMessage={t('offline')} />
        ) : null}
      </ConfirmDialog>
    </>
  );
}
