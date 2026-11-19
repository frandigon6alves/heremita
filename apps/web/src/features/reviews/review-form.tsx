'use client';

import type { PutReviewBody, Review } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { putReviewBodySchema } from '@/lib/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch, type FieldError } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { bodyFieldsOf, hasCode } from '@/lib/api/failure';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { ConfirmDialog } from '@/shared/components/dialog/confirm-dialog';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { RatingInput } from '@/shared/components/rating-input/rating-input';
import { TextArea } from '@/shared/components/text-area/text-area';
import { TextField } from '@/shared/components/text-field/text-field';
import { showToast } from '@/shared/components/toast/toast-store';
import { VisuallyHidden } from '@/shared/components/visually-hidden/visually-hidden';
import { useThrottledValue } from './use-throttled-value';
import styles from './review-form.module.css';

const FIELDS = ['rating', 'visitedMonth', 'body'] as const;

/** The API refused a field that passed the shared schema here. */
const SERVER = 'server';
/** Screen readers hear the character count at most this often while typing. */
const COUNTER_ANNOUNCE_MS = 1000;

export interface ReviewFormProps {
  placeId: string;
  /** The viewer's review: the form edits it ("Atualizar") and offers deleting it. */
  myReview: Review | null;
  /** `YYYY-MM` of today (server clock): the latest month a visit can be in. */
  currentMonth: string;
}

/**
 * Write or edit one's review of a place (E46 PUT, E47 DELETE): stars,
 * visit month (not in the future), text 10–2000 with a counter. Success goes
 * back to the place page with a toast.
 */
export function ReviewForm({ placeId, myReview, currentMonth }: ReviewFormProps) {
  const t = useTranslations('reviews.form');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PutReviewBody>({
    resolver: zodResolver(
      putReviewBodySchema.refine((review) => review.visitedMonth <= currentMonth, {
        path: ['visitedMonth'],
      }),
    ),
    mode: 'onTouched',
    defaultValues: {
      rating: myReview?.rating,
      visitedMonth: myReview?.visitedMonth ?? '',
      body: myReview?.body ?? '',
    },
  });
  const body = useWatch({ control, name: 'body' }) ?? '';
  const announcedLength = useThrottledValue(body.length, COUNTER_ANNOUNCE_MS);

  async function backToPlace(message: string) {
    setLeaving(true);
    showToast({ message });
    await queryClient.invalidateQueries({ queryKey: queryKeys.places.place(placeId) });
    router.push(routes.place(locale, placeId));
  }

  const save = useMutation({
    mutationFn: (review: PutReviewBody) =>
      apiFetch(apiRoutes.putMyReview, { params: { placeId }, body: review }),
  });

  const onSubmit = handleSubmit(async (review) => {
    setFailure(null);
    try {
      await save.mutateAsync(review);
      await backToPlace(myReview === null ? t('published') : t('updated'));
    } catch (error) {
      const fields = bodyFieldsOf(error, FIELDS);
      if (fields.length > 0) {
        fields.forEach((field, index) =>
          setError(field, { type: SERVER }, { shouldFocus: index === 0 }),
        );
      } else {
        setFailure({ error });
      }
    }
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(apiRoutes.deleteMyReview, { params: { placeId } }),
    onSuccess: async () => {
      setConfirmingDelete(false);
      await backToPlace(t('deleted'));
    },
  });

  const pending = isSubmitting || leaving;
  const editing = myReview !== null;

  return (
    <>
      <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <RatingInput
              legend={t('rating')}
              optionLabel={(count) => t('ratingOption', { count })}
              value={field.value ?? null}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={errors.rating ? t('ratingRequired') : undefined}
            />
          )}
        />
        <TextField
          type="month"
          label={t('visitedMonth')}
          hint={t('visitedMonthHint')}
          error={monthMessage(errors.visitedMonth)}
          max={currentMonth}
          pattern="\d{4}-\d{2}"
          className={styles.month}
          {...register('visitedMonth')}
        />
        <div className={styles.bodyField}>
          <TextArea
            label={t('body')}
            hint={t('bodyHint', { min: LIMITS.REVIEW_BODY_MIN, max: LIMITS.REVIEW_BODY_MAX })}
            error={bodyMessage(errors.body)}
            rows={6}
            {...register('body')}
          />
          <p className={styles.counter} aria-hidden="true">
            {t('counter', { count: body.length, max: LIMITS.REVIEW_BODY_MAX })}
          </p>
          <VisuallyHidden aria-live="polite">
            {t('counterLive', { count: announcedLength, max: LIMITS.REVIEW_BODY_MAX })}
          </VisuallyHidden>
        </div>
        <p className={styles.note}>{t('privacyNote')}</p>
        {failure === null ? null : (
          <FormAlert
            error={failure.error}
            message={hasCode(failure.error, 'place_not_found') ? t('gone') : t('failed')}
            offlineMessage={t('offline')}
          />
        )}
        <Button type="submit" variant="primary" size="large" block busy={pending}>
          {submitLabel()}
        </Button>
      </form>
      {editing ? (
        <div className={styles.danger}>
          <Button variant="ghost" onClick={() => setConfirmingDelete(true)} disabled={pending}>
            {t('delete')}
          </Button>
          <ConfirmDialog
            open={confirmingDelete}
            onClose={() => {
              remove.reset();
              setConfirmingDelete(false);
            }}
            title={t('deleteTitle')}
            confirmLabel={t('deleteConfirm')}
            onConfirm={() => remove.mutate()}
            busy={remove.isPending || leaving}
          >
            <p>{t('deleteBody')}</p>
            {remove.isError ? <FormAlert error={remove.error} message={t('deleteFailed')} /> : null}
          </ConfirmDialog>
        </div>
      ) : null}
    </>
  );

  function submitLabel(): string {
    if (editing) {
      return pending ? t('updating') : t('update');
    }
    return pending ? t('publishing') : t('publish');
  }

  function monthMessage(error: FieldError | undefined): string | undefined {
    if (error === undefined) {
      return undefined;
    }
    return error.type === 'custom' || error.type === SERVER
      ? t('visitedMonthFuture')
      : t('visitedMonthRequired');
  }

  function bodyMessage(error: FieldError | undefined): string | undefined {
    if (error === undefined) {
      return undefined;
    }
    return error.type === 'too_big'
      ? t('bodyTooLong', { max: LIMITS.REVIEW_BODY_MAX })
      : t('bodyTooShort', { min: LIMITS.REVIEW_BODY_MIN });
  }
}
