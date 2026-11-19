'use client';

import { travelModeSchema, type LngLat, type TravelMode } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import { formatDistance } from '@/lib/format/distance';
import { formatDuration } from '@/lib/format/duration';
import {
  PopoverMenu,
  type PopoverMenuSection,
} from '@/shared/components/popover-menu/popover-menu';
import type { LegView } from './day-route';
import { ModeIcon } from './mode-icon';
import { appleMapsLegUrl, googleMapsLegUrl } from './nav-links';
import styles from './leg-row.module.css';

interface LegRowProps {
  /** `null` while the route is loading. */
  leg: LegView | null;
  /** The leg's mode as far as the plan knows (shown while loading too). */
  mode: TravelMode;
  toName: string;
  from: LngLat | undefined;
  to: LngLat | undefined;
  /** Owner only: changes this leg's mode. */
  onModeChange?: (mode: TravelMode) => void;
  disabled?: boolean;
}

/**
 * The line between two stops: "12 min · 900 m", or "≈ 15 min (estimate)"
 * for a straight-line estimate. Tapping it offers the leg's mode (owner)
 * and directions in Google Maps or Apple Maps.
 */
export function LegRow({ leg, mode, toName, from, to, onModeChange, disabled }: LegRowProps) {
  const t = useTranslations('itinerary.route');
  const locale = useLocale();

  if (leg === null) {
    return (
      <p className={styles.pending}>
        <ModeIcon mode={mode} />
        <span>{t('legPending')}</span>
      </p>
    );
  }

  const duration = formatDuration(leg.durationSeconds, locale);
  const distance = formatDistance(leg.distanceMeters, locale);
  const text = leg.estimated
    ? t('legEstimated', { duration, distance })
    : t('leg', { duration, distance });

  const sections: PopoverMenuSection[] = [];
  if (onModeChange) {
    sections.push({
      heading: t('legMode'),
      items: travelModeSchema.options.map((option) => ({
        id: option,
        label: t(`mode.${option}`),
        icon: <ModeIcon mode={option} />,
        current: option === leg.mode,
        disabled,
        onSelect: () => onModeChange(option),
      })),
    });
  }
  if (from && to) {
    sections.push({
      heading: t('directions'),
      items: [
        { id: 'google', label: t('google'), href: googleMapsLegUrl(from, to, leg.mode) },
        { id: 'apple', label: t('apple'), href: appleMapsLegUrl(from, to, leg.mode) },
      ],
    });
  }

  return (
    <PopoverMenu
      triggerClassName={styles.trigger}
      label={t('legLabel', { name: toName, mode: leg.mode, summary: text })}
      trigger={
        <>
          <ModeIcon mode={leg.mode} />
          <span className={leg.estimated ? styles.estimated : undefined}>{text}</span>
        </>
      }
      sections={sections}
    />
  );
}
