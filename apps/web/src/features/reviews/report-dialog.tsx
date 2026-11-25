'use client';

import type { CreateReportBody, ReportTargetType } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS, REPORT_REASONS } from '@heremita/shared/plain';
import { createReportBodySchema } from '@/lib/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { hasCode } from '@/lib/api/failure';
import { Button } from '@/shared/components/button/button';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { TextArea } from '@/shared/components/text-area/text-area';
import { showToast } from '@/shared/components/toast/toast-store';
import styles from './report-dialog.module.css';

const reportFormSchema = createReportBodySchema.omit({ target: true });
type ReportFields = Omit<CreateReportBody, 'target'>;

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** What is reported: a review (place page) or a trip (read-only trip page). */
  target: { type: ReportTargetType; id: string };
}

/**
 * Report form (E49): a reason (required) and optional details, checked with
 * the shared schema. Sends once; a duplicate report, vanished content or own
 * content is explained in the dialog, success closes it with a toast.
 */
export function ReportDialog({ open, onClose, target }: ReportDialogProps) {
  const t = useTranslations('reviews.report');
  const tActions = useTranslations('common.actions');
  const legendId = useId();
  const reasonErrorId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReportFields, unknown, ReportFields>({
    resolver: zodResolver(reportFormSchema),
    mode: 'onTouched',
    defaultValues: { details: '' },
  });
  const report = useMutation({
    mutationFn: ({ reason, details }: ReportFields) =>
      apiFetch(apiRoutes.createReport, {
        body: { target, reason, details: details === '' ? undefined : details },
      }),
    onSuccess: () => {
      close();
      showToast({ message: t('sent') });
    },
  });

  function close() {
    reset();
    report.reset();
    onClose();
  }

  function failureMessage(error: unknown): string {
    if (hasCode(error, 'already_reported')) {
      return t('alreadyReported');
    }
    if (hasCode(error, 'not_found')) {
      return t('gone');
    }
    if (hasCode(error, 'cannot_report_own')) {
      return t('own');
    }
    return t('failed');
  }

  const reasonInvalid = errors.reason !== undefined;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={target.type === 'review' ? t('titleReview') : t('titleTrip')}
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => void handleSubmit((body) => report.mutate(body))(event)}
      >
        <fieldset
          className={styles.reasons}
          role="radiogroup"
          aria-labelledby={legendId}
          aria-describedby={reasonInvalid ? reasonErrorId : undefined}
          aria-invalid={reasonInvalid ? true : undefined}
        >
          <legend id={legendId} className={styles.legend}>
            {t('reason')}
          </legend>
          {REPORT_REASONS.map((value, index) => (
            <label key={value} className={styles.reason}>
              <input
                type="radio"
                value={value}
                {...register('reason')}
                {...(index === 0 ? initialFocus : {})}
              />
              {t(`reasons.${value}`)}
            </label>
          ))}
          {reasonInvalid ? (
            <p id={reasonErrorId} className={styles.error} role="alert">
              {t('reasonRequired')}
            </p>
          ) : null}
        </fieldset>
        <TextArea
          label={t('details')}
          hint={t('detailsHint', { max: LIMITS.REPORT_DETAILS_MAX })}
          error={
            errors.details === undefined
              ? undefined
              : t('detailsTooLong', { max: LIMITS.REPORT_DETAILS_MAX })
          }
          {...register('details')}
        />
        {report.isError ? (
          <FormAlert error={report.error} message={failureMessage(report.error)} />
        ) : null}
        <DialogActions>
          <Button disabled={report.isPending} onClick={close}>
            {tActions('cancel')}
          </Button>
          <Button type="submit" variant="primary" busy={report.isPending}>
            {report.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
