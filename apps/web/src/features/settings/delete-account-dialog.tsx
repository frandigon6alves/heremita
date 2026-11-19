'use client';

import {
  deleteAccountBodySchema,
  endpoints,
  LIMITS,
  type DeleteAccountBody,
} from '@heremita/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { PasswordField } from '@/shared/components/password-field/password-field';
import { showToast } from '@/shared/components/toast/toast-store';
import { clearDrafts } from '@/shared/storage/session-drafts';
import { FailureAlert } from './failure-alert';
import { submitOutcome, type SubmitOutcome } from './submit-failure';
import styles from './settings.module.css';

const FIELDS = ['password'] as const;
/** E11 422 `wrong_password`. */
const WRONG = 'wrong';

type FormFailure = Extract<SubmitOutcome<string>, { kind: 'form' }>;

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
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<FormFailure | null>(null);
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
    mutationFn: (body: DeleteAccountBody) => apiFetch(endpoints.deleteAccount, { body }),
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
      const outcome = submitOutcome(error, FIELDS);
      if (outcome.kind === 'fields') {
        setError(
          'password',
          { type: outcome.wrongPassword ? WRONG : 'server' },
          { shouldFocus: true },
        );
      } else {
        setFailure(outcome);
      }
      return;
    }
    setLeaving(true);
    showToast({ message: t('deleted') });
    queryClient.clear();
    clearDrafts();
    router.replace(routes.landing(locale));
    router.refresh();
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
        {failure === null ? null : (
          <FailureAlert failure={failure.failure} requestId={failure.requestId} />
        )}
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
