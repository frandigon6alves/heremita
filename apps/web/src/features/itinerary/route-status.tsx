'use client';

import type { TravelMode } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/shared/components/button/button';
import type { DayRouteView } from './day-route';
import { ModeSwitch } from './mode-switch';
import styles from './route-status.module.css';

interface RouteStatusProps {
  view: DayRouteView;
  stopCount: number;
  /** Mode the switch shows: the URL mode, else the day's saved one. */
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  nameOf: (stopId: string) => string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Owner: "add another place" invites an edit; viewers only read. */
  owner: boolean;
  disabled?: boolean;
}

/**
 * Top of a day's list: mode switch, then what the route needs to be read
 * right: a thin bar while it loads, a failure with Retry (legs fall back to
 * estimates), or the stops no road or path reaches in this mode.
 */
export function RouteStatus({
  view,
  stopCount,
  mode,
  onModeChange,
  nameOf,
  loading,
  failed,
  onRetry,
  owner,
  disabled,
}: RouteStatusProps) {
  const t = useTranslations('itinerary.route');
  const locale = useLocale();

  if (stopCount === 0) {
    return null;
  }
  if (stopCount === 1) {
    return owner ? <p className={styles.note}>{t('needsTwo')}</p> : null;
  }

  const unreachable = view.unroutableStopIds.map(nameOf);
  return (
    <div className={styles.status}>
      <ModeSwitch value={mode} onChange={onModeChange} disabled={disabled} />
      <div className={styles.progress} data-active={loading || undefined} aria-hidden="true" />
      {failed ? (
        <div className={styles.banner} role="alert">
          <p>{t('failed')}</p>
          <Button onClick={onRetry}>{t('retry')}</Button>
        </div>
      ) : null}
      {!failed && unreachable.length > 0 ? (
        <p className={styles.banner}>
          {t('partial', {
            names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(unreachable),
            mode,
          })}
        </p>
      ) : null}
    </div>
  );
}
