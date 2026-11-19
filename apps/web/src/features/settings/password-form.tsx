'use client';

import type { ChangePasswordBody } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { changePasswordBodySchema } from '@/lib/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { bodyFieldsOf, hasCode, SERVER_ERROR, showFieldErrors } from '@/lib/api/failure';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { PasswordField } from '@/shared/components/password-field/password-field';
import { showToast } from '@/shared/components/toast/toast-store';
import styles from './settings.module.css';

const FIELDS = ['currentPassword', 'newPassword'] as const;
/** The API refused a value that passed the shared schema here. */
/** E10 422 `wrong_password`: the current password does not match. */
const WRONG = 'wrong';
/** The new password is the e-mail address or its local part. */
const IS_EMAIL = 'custom';

function isDerivedFromEmail(password: string, email: string): boolean {
  const candidate = password.toLowerCase();
  return candidate === email || candidate === email.slice(0, email.lastIndexOf('@'));
}

/**
 * Change password (E10). The API keeps this session (with a new cookie) and
 * ends every other one; the form says so and empties itself.
 */
export function PasswordForm({ email }: { email: string }) {
  const t = useTranslations('settings.password');
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordBody>({
    resolver: zodResolver(
      changePasswordBodySchema.refine((body) => !isDerivedFromEmail(body.newPassword, email), {
        path: ['newPassword'],
      }),
    ),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const change = useMutation({
    mutationFn: (body: ChangePasswordBody) => apiFetch(apiRoutes.changePassword, { body }),
  });

  const onSubmit = handleSubmit(async (body) => {
    setFailure(null);
    try {
      await change.mutateAsync(body);
      reset();
      showToast({ message: t('changed') });
    } catch (error) {
      const type = hasCode(error, 'wrong_password') ? WRONG : SERVER_ERROR;
      if (!showFieldErrors(setError, bodyFieldsOf(error, FIELDS), type)) {
        setFailure({ error });
      }
    }
  });

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
      <p className={styles.note}>{t('intro')}</p>
      <PasswordField
        label={t('current')}
        error={currentMessage(errors.currentPassword)}
        autoComplete="current-password"
        {...register('currentPassword')}
      />
      <PasswordField
        label={t('new')}
        hint={t('newHint', { min: LIMITS.PASSWORD_MIN })}
        error={newMessage(errors.newPassword)}
        autoComplete="new-password"
        {...register('newPassword')}
      />
      {failure === null ? null : <FormAlert error={failure.error} />}
      <Button className={styles.submit} type="submit" variant="primary" busy={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );

  function currentMessage(error: FieldError | undefined): string | undefined {
    if (error === undefined) {
      return undefined;
    }
    if (error.type === WRONG) {
      return t('errors.currentWrong');
    }
    return error.type === 'too_big'
      ? t('errors.currentTooLong', { max: LIMITS.PASSWORD_MAX })
      : t('errors.currentRequired');
  }

  function newMessage(error: FieldError | undefined): string | undefined {
    switch (error?.type) {
      case undefined:
        return undefined;
      case SERVER_ERROR:
        return t('errors.newRejected');
      case IS_EMAIL:
        return t('errors.newIsEmail');
      case 'too_big':
        return t('errors.newTooLong', { max: LIMITS.PASSWORD_MAX });
      default:
        return t('errors.newTooShort', { min: LIMITS.PASSWORD_MIN });
    }
  }
}
