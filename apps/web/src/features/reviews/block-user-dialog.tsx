'use client';

import { endpoints, type UserCard } from '@heremita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { ConfirmDialog } from '@/shared/components/dialog/confirm-dialog';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { showToast } from '@/shared/components/toast/toast-store';

export interface BlockUserDialogProps {
  open: boolean;
  onClose: () => void;
  user: UserCard;
}

/**
 * Confirms blocking an author (E13). Afterwards their reviews and trips
 * disappear everywhere: places, explore and the blocked list are refetched.
 */
export function BlockUserDialog({ open, onClose, user }: BlockUserDialogProps) {
  const t = useTranslations('reviews.block');
  const queryClient = useQueryClient();
  const block = useMutation({
    mutationFn: () => apiFetch(endpoints.blockUser, { params: { userId: user.id } }),
    onSuccess: async () => {
      close();
      showToast({ message: t('done', { name: user.displayName }) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.me.blocks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.places.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.explore.all }),
      ]);
    },
  });

  function close() {
    block.reset();
    onClose();
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      title={t('title', { name: user.displayName })}
      confirmLabel={t('confirm', { name: user.displayName })}
      onConfirm={() => block.mutate()}
      busy={block.isPending}
    >
      <p>{t('body', { name: user.displayName })}</p>
      {block.isError ? (
        <FormAlert error={block.error} message={t('failed', { name: user.displayName })} />
      ) : null}
    </ConfirmDialog>
  );
}
