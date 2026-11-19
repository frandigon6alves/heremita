'use client';

import type { ModerationDecision, Page, ReportItem, ReportStatus } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { REPORT_STATUSES } from '@heremita/shared/plain';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { hasCode } from '@/lib/api/failure';
import { firstPageData, moderationReportsQuery, queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { ErrorState } from '@/shared/components/error-state/error-state';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { LoadMore } from '@/shared/components/load-more/load-more';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import { showToast } from '@/shared/components/toast/toast-store';
import styles from './moderation-queue.module.css';

export interface ModerationQueueProps {
  /** First page of open reports, rendered on the server. */
  initialOpenPage?: Page<ReportItem>;
}

/**
 * Report queue of moderators (E50): open / actioned / dismissed, oldest
 * first, "Load more". Each report can hide or restore its content or be
 * dismissed (E51); decisions are manual only.
 */
export function ModerationQueue({ initialOpenPage }: ModerationQueueProps) {
  const t = useTranslations('reviews.moderation');
  const [status, setStatus] = useState<ReportStatus>('open');
  const serverRendered = status === 'open' && initialOpenPage !== undefined;
  const reports = useInfiniteQuery({
    ...moderationReportsQuery(status),
    initialData: serverRendered ? firstPageData(initialOpenPage) : undefined,
    // The server page was fetched for this very render: no second request on mount.
    refetchOnMount: !serverRendered,
  });
  const items = reports.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className={styles.queue}>
      <SegmentedControl
        legend={t('status')}
        options={REPORT_STATUSES.map((value) => ({
          value,
          label: t(`statuses.${value}`),
        }))}
        value={status}
        onChange={setStatus}
      />
      {content()}
    </div>
  );

  function content() {
    if (reports.isPending) {
      return (
        <Skeleton>
          <SkeletonBlock height="10rem" />
          <SkeletonBlock height="10rem" />
        </Skeleton>
      );
    }
    if (reports.isError && reports.data === undefined) {
      return (
        <ErrorState
          headingLevel={2}
          title={t('failed')}
          onRetry={() => void reports.refetch()}
          error={reports.error}
        />
      );
    }
    if (items.length === 0) {
      return <EmptyState title={status === 'open' ? t('emptyOpen') : t('emptyResolved')} />;
    }
    return (
      <>
        <ol className={styles.items} role="list">
          {items.map((report) => (
            <li key={report.id}>
              <ReportCard report={report} />
            </li>
          ))}
        </ol>
        <LoadMore pages={reports} failedMessage={t('failed')} />
      </>
    );
  }
}

function ReportCard({ report }: { report: ReportItem }) {
  const t = useTranslations('reviews.moderation');
  const tReasons = useTranslations('reviews.report.reasons');
  const locale = useLocale();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (decision: ModerationDecision) =>
      apiFetch(apiRoutes.decideReport, { params: { reportId: report.id }, body: { decision } }),
    onSuccess: async (_, decision) => {
      showToast({ message: decidedMessage(decision) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all });
    },
  });
  const date = format.dateTime(new Date(report.createdAt), { dateStyle: 'medium' });
  const hidden = report.contentStatus === 'hidden';

  function decidedMessage(decision: ModerationDecision): string {
    switch (decision) {
      case 'hide_content':
        return t('hidden');
      case 'restore_content':
        return t('restored');
      case 'dismiss':
        return t('dismissed');
    }
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <span className={styles.target}>{t(`targets.${report.target.type}`)}</span>
        <span className={hidden ? styles.statusHidden : styles.statusVisible}>
          {hidden ? t('contentHidden') : t('contentVisible')}
        </span>
      </header>
      <blockquote className={styles.excerpt}>{report.target.excerpt}</blockquote>
      {report.target.type === 'trip' ? (
        <Link className={styles.link} href={routes.publicTrip(locale, report.target.id)}>
          {t('openTrip')}
        </Link>
      ) : null}
      <p>{t('reason', { reason: tReasons(report.reason) })}</p>
      {report.details === null ? null : (
        <p className={styles.details}>{t('details', { details: report.details })}</p>
      )}
      <p className={styles.meta}>
        {report.reporter === null
          ? t('reportedByDeleted', { date })
          : t('reportedBy', { name: report.reporter.displayName, date })}
      </p>
      {decide.isError ? (
        <FormAlert
          error={decide.error}
          message={hasCode(decide.error, 'not_found') ? t('gone') : t('decisionFailed')}
        />
      ) : null}
      <div
        className={styles.actions}
        role="group"
        aria-label={t('decisions', { excerpt: report.target.excerpt })}
      >
        {hidden ? (
          <Button
            busy={decide.isPending && decide.variables === 'restore_content'}
            disabled={decide.isPending}
            onClick={() => decide.mutate('restore_content')}
          >
            {t('restore')}
          </Button>
        ) : (
          <Button
            variant="primary"
            busy={decide.isPending && decide.variables === 'hide_content'}
            disabled={decide.isPending}
            onClick={() => decide.mutate('hide_content')}
          >
            {t('hide')}
          </Button>
        )}
        {report.status === 'open' ? (
          <Button
            busy={decide.isPending && decide.variables === 'dismiss'}
            disabled={decide.isPending}
            onClick={() => decide.mutate('dismiss')}
          >
            {t('dismiss')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
