'use client';

import {
  cleanText,
  endpoints,
  LIMITS,
  reportReasonSchema,
  type ReportReason,
  type ReportTargetType,
} from '@heremita/shared';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api/client';
import { problemCodeOf } from '@/lib/api/failure';
import { Button } from '@/shared/components/button/button';
import { Dialog, DialogActions, initialFocus } from '@/shared/components/dialog/dialog';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { TextArea } from '@/shared/components/text-area/text-area';
import { showToast } from '@/shared/components/toast/toast-store';
import styles from './report-dialog.module.css';

const REASONS = reportReasonSchema.options;

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** What is reported: a review (place page) or a trip (read-only trip page). */
  target: { type: ReportTargetType; id: string };
}

/**
 * Report form (E49): a reason (required) and optional details. Sends once;
 * a duplicate report, vanished content or own content is explained in the
 * dialog, success closes it with a toast.
 */
export function ReportDialog({ open, onClose, target }: ReportDialogProps) {
  const t = useTranslations('reviews.report');
  const tActions = useTranslations('common.actions');
  const reasonErrorId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [reasonMissing, setReasonMissing] = useState(false);
  const report = useMutation({
    mutationFn: (body: { reason: ReportReason; details: string | undefined }) =>
      apiFetch(endpoints.createReport, { body: { target, ...body } }),
    onSuccess: () => {
      close();
      showToast({ message: t('sent') });
    },
  });

  const cleanedDetails = cleanText(details);
  const detailsTooLong = cleanedDetails.length > LIMITS.REPORT_DETAILS_MAX;

  function close() {
    setReason(null);
    setDetails('');
    setReasonMissing(false);
    report.reset();
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReasonMissing(reason === null);
    if (reason === null || detailsTooLong) {
      return;
    }
    report.mutate({ reason, details: cleanedDetails === '' ? undefined : cleanedDetails });
  }

  function failureMessage(error: unknown): string {
    switch (problemCodeOf(error)) {
      case 'already_reported':
        return t('alreadyReported');
      case 'not_found':
        return t('gone');
      case 'cannot_report_own':
        return t('own');
      default:
        return t('failed');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={target.type === 'review' ? t('titleReview') : t('titleTrip')}
    >
      <form className={styles.form} noValidate onSubmit={submit}>
        <fieldset
          className={styles.reasons}
          aria-describedby={reasonMissing ? reasonErrorId : undefined}
        >
          <legend className={styles.legend}>{t('reason')}</legend>
          {REASONS.map((value, index) => (
            <label key={value} className={styles.reason}>
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => {
                  setReason(value);
                  setReasonMissing(false);
                }}
                {...(index === 0 ? initialFocus : {})}
              />
              {t(`reasons.${value}`)}
            </label>
          ))}
          {reasonMissing ? (
            <p id={reasonErrorId} className={styles.error} role="alert">
              {t('reasonRequired')}
            </p>
          ) : null}
        </fieldset>
        <TextArea
          label={t('details')}
          hint={t('detailsHint', { max: LIMITS.REPORT_DETAILS_MAX })}
          error={
            detailsTooLong ? t('detailsTooLong', { max: LIMITS.REPORT_DETAILS_MAX }) : undefined
          }
          value={details}
          onChange={(event) => setDetails(event.target.value)}
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
