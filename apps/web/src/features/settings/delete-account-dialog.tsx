'use client';

import type { DeleteAccountBody } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { deleteAccountBodySchema } from '@/lib/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { bodyFieldsOf, hasCode, SERVER_ERROR, showFieldErrors } from '@/lib/api/failure';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { PasswordField } from '@/shared/components/password-field/password-field';
import { showToast } from '@/shared/components/toast/toast-store';
import { useSignedOut } from '@/shared/hooks/use-signed-out';
import styles from './settings.module.css';

const FIELDS = ['password'] as const;
/** E11 422 `wrong_password`. */
const WRONG = 'wrong';

export interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Delete account (E11): warns what disappears and asks for the password.
 * Cancel takes the initial focus. Afterwards nothing of the account stays in
 * memory and the viewer lands on the start page.
 */
export function DeleteAccountDialog({ open, onClose }: DeleteAccountDialogProps) {
  const t = useTranslations('settings.account');
  const signedOut = useSignedOut();
  const tActions = useTranslations('common.actions');
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountBody>({
    resolver: zodResolver(deleteAccountBodySchema),
    mode: 'onTouched',
    defaultValues: { password: '' },
  });
  const remove = useMutation({
    mutationFn: (body: DeleteAccountBody) => apiFetch(apiRoutes.deleteAccount, { body }),
  });

  const close = () => {
    reset();
    setFailure(null);
    onClose();
  };

  const onSubmit = handleSubmit(async (body) => {
    setFailure(null);
    try {
      await remove.mutateAsync(body);
    } catch (error) {
      const type = hasCode(error, 'wrong_password') ? WRONG : SERVER_ERROR;
      if (!showFieldErrors(setError, bodyFieldsOf(error, FIELDS), type)) {
        setFailure({ error });
      }
      return;
    }
    setLeaving(true);
    showToast({ message: t('deleted') });
    signedOut();
  });
  const pending = isSubmitting || leaving;

  return (
    <Dialog open={open} onClose={close} title={t('deleteTitle')}>
      <form className={styles.dialogForm} noValidate onSubmit={(event) => void onSubmit(event)}>
        <p>{t('deleteBody')}</p>
        <PasswordField
          label={t('deletePassword')}
          error={passwordMessage(errors.password)}
          autoComplete="current-password"
          {...register('password')}
        />
        {failure === null ? null : <FormAlert error={failure.error} />}
        <DialogActions>
          <Button {...initialFocus} disabled={pending} onClick={close}>
            {tActions('cancel')}
          </Button>
          <Button type="submit" variant="danger" busy={pending}>
            {pending ? t('deleting') : t('deleteConfirm')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );

  function passwordMessage(error: FieldError | undefined): string | undefined {
    if (error === undefined) {
      return undefined;
    }
    if (error.type === WRONG) {
      return t('errors.passwordWrong');
    }
    return error.type === 'too_big'
      ? t('errors.passwordTooLong', { max: LIMITS.PASSWORD_MAX })
      : t('errors.passwordRequired');
  }
}
