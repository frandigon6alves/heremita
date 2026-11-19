'use client';

import type { UpdateMeBody } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { updateMeBodySchema } from '@/lib/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { bodyFieldsOf } from '@/lib/api/failure';
import { queryKeys } from '@/lib/api/query-keys';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { TextField } from '@/shared/components/text-field/text-field';
import { showToast } from '@/shared/components/toast/toast-store';
import styles from './settings.module.css';

const FIELDS = ['displayName'] as const;
/** The API refused a name that passed the shared schema here. */
const SERVER = 'server';

/** Display name (E9). Saved explicitly: a half-typed name never reaches other people. */
export function ProfileForm({ displayName }: { displayName: string }) {
  const t = useTranslations('settings.profile');
  const queryClient = useQueryClient();
  const router = useRouter();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateMeBody>({
    resolver: zodResolver(updateMeBodySchema),
    mode: 'onTouched',
    defaultValues: { displayName },
  });
  const save = useMutation({
    mutationFn: (body: UpdateMeBody) => apiFetch(apiRoutes.updateMe, { body }),
  });

  const onSubmit = handleSubmit(async (body) => {
    setFailure(null);
    try {
      const me = await save.mutateAsync(body);
      queryClient.setQueryData(queryKeys.viewer, me);
      reset({ displayName: me.displayName });
      showToast({ message: t('saved') });
      // The app bar shows the name from the server render.
      router.refresh();
    } catch (error) {
      if (bodyFieldsOf(error, FIELDS).length > 0) {
        setError('displayName', { type: SERVER }, { shouldFocus: true });
      } else {
        setFailure({ error });
      }
    }
  });

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
      <TextField
        label={t('displayName')}
        hint={t('displayNameHint')}
        error={nameMessage(errors.displayName)}
        autoComplete="name"
        {...register('displayName')}
      />
      {failure === null ? null : <FormAlert error={failure.error} />}
      <Button className={styles.submit} type="submit" variant="primary" busy={isSubmitting}>
        {isSubmitting ? t('saving') : t('save')}
      </Button>
    </form>
  );

  function nameMessage(error: FieldError | undefined): string | undefined {
    if (error === undefined) {
      return undefined;
    }
    if (error.type === SERVER) {
      return t('errors.rejected');
    }
    return error.type === 'too_big'
      ? t('errors.tooLong', { max: LIMITS.DISPLAY_NAME_MAX })
      : t('errors.required');
  }
}
