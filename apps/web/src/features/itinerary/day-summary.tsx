'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatCalendarDate } from '@/lib/format/dates';
import { formatDistance } from '@/lib/format/distance';
import { formatDuration } from '@/lib/format/duration';
import { ALL_DAYS, findDay, ideaIds, IDEAS, type DaySelection, type PlanLike } from './plan-view';
import styles from './day-summary.module.css';

interface DaySummaryProps {
  plan: PlanLike;
  selection: DaySelection;
  /** Day dates (owner shape only; read-only pages never show dates). */
  dateOf?: (dayId: string) => string | null;
  /** Controls at the end of the line, e.g. the day's menu. */
  actions?: ReactNode;
  /** The selected day's route totals, once every leg is known. */
  totals?: { distanceMeters: number; durationSeconds: number; estimated: boolean } | null;
}

/** One line under the chips: "Dia 2 · sáb., 14 de mar. · 4 lugares · 3,2 km · 48 min". */
export function DaySummary({ plan, selection, dateOf, actions, totals }: DaySummaryProps) {
  const t = useTranslations('itinerary.summary');
  const tDays = useTranslations('itinerary.days');
  const locale = useLocale();

  const parts: string[] = [];
  if (selection === IDEAS) {
    parts.push(tDays('ideas'), t('places', { count: ideaIds(plan).length }));
  } else if (selection === ALL_DAYS) {
    parts.push(
      t('allDays', { count: plan.days.length }),
      t('places', { count: plan.places.length }),
    );
  } else {
    const day = findDay(plan, selection);
    const date = day && dateOf?.(day.id);
    parts.push(tDays('day', { number: day?.number ?? 0 }));
    if (date) {
      parts.push(formatCalendarDate(date, locale));
    }
    parts.push(t('places', { count: day?.stops.length ?? 0 }));
    if (totals) {
      parts.push(
        formatDistance(totals.distanceMeters, locale),
        formatDuration(totals.durationSeconds, locale),
      );
      if (totals.estimated) {
        parts.push(t('includesEstimates'));
      }
    }
  }

  return (
    <div className={styles.summary}>
      <p className={styles.text}>{parts.join(' · ')}</p>
      {actions}
    </div>
  );
}
