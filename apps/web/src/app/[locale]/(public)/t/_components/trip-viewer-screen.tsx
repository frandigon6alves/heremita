'use client';

import type { TripPlanViewer } from '@heremita/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react';
import { DayChips } from '@/features/itinerary/day-chips';
import { DaySummary } from '@/features/itinerary/day-summary';
import {
  ALL_DAYS,
  defaultDaySelection,
  findPlace,
  IDEAS,
  resolveDaySelection,
  selectionPoints,
  type DaySelection,
} from '@/features/itinerary/plan-view';
import { PlannerCamera } from '@/features/itinerary/planner-camera';
import { ReadOnlyItinerary } from '@/features/itinerary/read-only-itinerary';
import type { OpenSource } from '@/features/itinerary/stop-row';
import { planPins } from '@/features/itinerary/trip-to-geojson';
import type { PlanSource } from '@/features/itinerary/use-day-routes';
import { usePlannerParams } from '@/features/itinerary/use-planner-params';
import { useSelectionRoute } from '@/features/itinerary/use-selection-route';
import { ReportDialog } from '@/features/reviews/report-dialog';
import { CopyTripButton } from '@/features/trips/copy-trip-button';
import { useCopyTrip } from '@/features/trips/use-copy-trip';
import { planQuery, sharedPlanQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { AppBar } from '@/shared/components/app-bar/app-bar';
import { BottomSheet, PANEL_QUERY, type Snap } from '@/shared/components/bottom-sheet/bottom-sheet';
import { buttonClassName } from '@/shared/components/button/button-class';
import { DemoBadge } from '@/shared/components/demo-badge/demo-badge';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { Copy, Flag } from '@/shared/icons/icons';
import { PinsLayer } from '@/shared/map/pins-layer';
import { RouteLineLayer } from '@/shared/map/route-line-layer';
import { TripMap } from '@/shared/map/trip-map';
import { useMapPadding } from '@/shared/map/use-map-padding';
import { CommunitySlot } from '../../../(app)/trips/[tripId]/_components/community-slot';
import { initialMapView } from '../../../(app)/trips/[tripId]/_components/initial-map-view';
import { rememberCopyIntent, takeCopyIntent } from './copy-intent';
import styles from './trip-viewer-screen.module.css';

const SNAP_ORDER: readonly Snap[] = ['peek', 'half', 'full'];

interface ViewerPageProps {
  initialPlan: TripPlanViewer;
  /** When the server render fetched `initialPlan` (ms). */
  initialUpdatedAt: number;
  signedIn: boolean;
  /** This page's path and query: where login sends the viewer back to. */
  path: string;
}

interface TripViewerScreenProps {
  /** `/t/[tripId]` (public trip, E24 + E40) or `/s/[shareToken]` (E26 + E27). */
  source: PlanSource;
  plan: TripPlanViewer;
  signedIn: boolean;
  path: string;
}

/** `/t/[tripId]`: the public trip's plan (E24), kept fresh by its query. */
export function PublicTripViewer({
  tripId,
  initialPlan,
  initialUpdatedAt,
  ...props
}: ViewerPageProps & { tripId: string }) {
  const { data } = useQuery({
    ...planQuery(tripId),
    initialData: initialPlan,
    initialDataUpdatedAt: initialUpdatedAt,
  });
  const plan = data.viewerRole === 'viewer' ? data : initialPlan;
  return <TripViewerScreen source={{ tripId }} plan={plan} {...props} />;
}

/** `/s/[shareToken]`: the plan behind a share link (E26), always the viewer shape. */
export function SharedTripViewer({
  shareToken,
  initialPlan,
  initialUpdatedAt,
  ...props
}: ViewerPageProps & { shareToken: string }) {
  const { data } = useQuery({
    ...sharedPlanQuery(shareToken),
    initialData: initialPlan,
    initialDataUpdatedAt: initialUpdatedAt,
  });
  return <TripViewerScreen source={{ shareToken }} plan={data} {...props} />;
}

function MapPadding({ bottom }: { bottom: number }) {
  useMapPadding({ bottom });
  return null;
}

/** `?copy=1`: the viewer chose "Copy" while signed out and comes back from login. */
const copyParam = parseAsStringLiteral(['1']);

function withCopy(path: string): string {
  const url = new URL(path, 'http://localhost');
  url.searchParams.set('copy', '1');
  return `${url.pathname}${url.search}`;
}

/**
 * Someone else's trip, read-only: same map + panel as the planner without
 * edit controls, notes or dates. The mode switch changes the URL only.
 * "Copy" copies it into my trips (signed out: after login, resumed by
 * `?copy=1`); the panel ends with a report link.
 */
function TripViewerScreen({ source, plan, signedIn, path }: TripViewerScreenProps) {
  const t = useTranslations('itinerary');
  const tDays = useTranslations('common.counts');
  const locale = useLocale();
  const params = usePlannerParams();
  const [copy, setCopy] = useQueryState('copy', copyParam);
  // Without `?day=` the first render's day stays selected when a refetch changes the plan.
  const [openingDay] = useState(() => defaultDaySelection(plan));
  const selection = resolveDaySelection(plan, params.day ?? openingDay);
  const selectedPlace = params.place === null ? undefined : findPlace(plan, params.place);
  const wide = useMediaQuery(PANEL_QUERY);
  const route = useSelectionRoute({ source, plan, selection, mode: params.mode });

  const [snap, setSnap] = useState<Snap>(openingDay === IDEAS ? 'peek' : 'half');
  const [sheetHeight, setSheetHeight] = useState(0);
  const [focusCard, setFocusCard] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [mapView] = useState(() => initialMapView(plan));
  const copyTrip = useCopyTrip(source);

  // Back from login with `?copy=1`: finish the copy this tab asked for. The
  // intent is spent on the first run, so a Strict Mode re-run copies nothing.
  const resumeCopy = useEffectEvent(() => {
    if (takeCopyIntent(source)) {
      copyTrip.mutate();
    }
    void setCopy(null, { history: 'replace' });
  });
  useEffect(() => {
    if (copy !== null && signedIn) {
      resumeCopy();
    }
  }, [copy, signedIn]);

  function openPlace(tripPlaceId: string, source: OpenSource) {
    setFocusCard(source === 'keyboard');
    setSnap('half');
    void params.selectPlace(tripPlaceId);
  }

  function handlePinSelect(tripPlaceId: string | null) {
    if (tripPlaceId !== null) {
      openPlace(tripPlaceId, 'pointer');
    } else if (selectedPlace) {
      void params.selectPlace(null);
    }
  }

  const handleLabel = (current: Snap, next: Snap) =>
    t('sheet.handle', {
      state: t(`sheet.snap.${current}`),
      action:
        SNAP_ORDER.indexOf(next) > SNAP_ORDER.indexOf(current)
          ? t('sheet.expand')
          : t('sheet.collapse'),
    });

  const { author } = plan.trip;

  return (
    <div
      className={styles.screen}
      style={{ '--sheet-height': `${sheetHeight}px` } as CSSProperties}
    >
      <AppBar
        end={
          signedIn ? (
            <CopyTripButton copy={copyTrip} label={t('readOnly.copy')} />
          ) : (
            <Link
              href={routes.login(locale, { next: withCopy(path) })}
              className={buttonClassName({ variant: 'primary' })}
              onClick={() => rememberCopyIntent(source)}
            >
              <Copy size={20} />
              {t('readOnly.copy')}
            </Link>
          )
        }
      >
        <h1 className={styles.title}>{plan.trip.title}</h1>
      </AppBar>
      <div className={styles.panelArea}>
        <a className={styles.skipLink} href="#trip-map">
          {t('screen.skipToMap')}
        </a>
        <BottomSheet
          snap={snap}
          onSnapChange={setSnap}
          onSnapSettled={setSheetHeight}
          labelledBy="trip-panel-heading"
          handleLabel={handleLabel}
          header={
            <>
              <h2 id="trip-panel-heading" className={styles.visuallyHidden}>
                {t('readOnly.panelHeading')}
              </h2>
              <DayChips
                plan={plan}
                selected={selection}
                onSelect={(next: DaySelection) => void params.selectDay(next)}
              />
              <DaySummary
                plan={plan}
                selection={selection}
                totals={
                  route.day?.view.totals
                    ? { ...route.day.view.totals, estimated: route.day.view.estimated }
                    : null
                }
              />
            </>
          }
        >
          <div className={styles.body}>
            <p className={styles.byline}>
              <Link className={styles.author} href={routes.profile(locale, author.id)}>
                {t('readOnly.by', { name: author.displayName })}
              </Link>
              {author.isDemo ? <DemoBadge /> : null}
              <span>· {tDays('days', { count: plan.trip.dayCount })}</span>
            </p>
            {plan.places.length === 0 ? (
              <p className={styles.empty}>{t('readOnly.emptyTrip')}</p>
            ) : (
              <ReadOnlyItinerary
                plan={plan}
                selection={selection}
                selectedPlaceId={selectedPlace?.id ?? null}
                route={route.day}
                onOpen={openPlace}
                onBack={() => void params.selectPlace(null)}
                onModeChange={(mode) => void params.selectMode(mode)}
                focusCard={focusCard}
                communitySlot={(tripPlaceId) => {
                  const entry = findPlace(plan, tripPlaceId);
                  return entry ? <CommunitySlot place={entry} locale={locale} /> : null;
                }}
              />
            )}
            <footer className={styles.footer}>
              {signedIn ? (
                <button type="button" className={styles.report} onClick={() => setReporting(true)}>
                  <Flag size={20} />
                  {t('readOnly.report')}
                </button>
              ) : (
                <Link className={styles.report} href={routes.login(locale, { next: path })}>
                  <Flag size={20} />
                  {t('readOnly.report')}
                </Link>
              )}
            </footer>
          </div>
        </BottomSheet>
      </div>
      <div id="trip-map" tabIndex={-1} className={styles.mapRegion}>
        <TripMap initialView={mapView} label={t('screen.mapLabel', { title: plan.trip.title })}>
          <RouteLineLayer lines={route.lines} dimmed={route.dimmed} />
          <PinsLayer
            pins={planPins(plan, selection)}
            selectedId={selectedPlace?.id ?? null}
            onSelect={handlePinSelect}
            cluster={selection === ALL_DAYS}
          />
          <PlannerCamera
            fitKey={selection}
            points={selectionPoints(plan, selection)}
            focus={selectedPlace?.place.location ?? null}
          />
          <MapPadding bottom={wide ? 0 : sheetHeight} />
        </TripMap>
      </div>
      {signedIn ? (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          target={{ type: 'trip', id: plan.trip.id }}
        />
      ) : null}
    </div>
  );
}
