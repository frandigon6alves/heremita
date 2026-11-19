'use client';

import {
  LIMITS,
  type LngLat,
  type PlaceResult,
  type TravelMode,
  type TripPlanOwner,
} from '@heremita/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState, type CSSProperties } from 'react';
import { AddHereButton } from '@/features/itinerary/add-here-button';
import { AllDaysList } from '@/features/itinerary/all-days-list';
import { DayChips } from '@/features/itinerary/day-chips';
import { DayMenu } from '@/features/itinerary/day-menu';
import { DaySummary } from '@/features/itinerary/day-summary';
import { IdeasList } from '@/features/itinerary/ideas-list';
import { MapCentreTracker, type MapCentre } from '@/features/itinerary/map-centre-tracker';
import { OptimisePreview } from '@/features/itinerary/optimise-preview';
import { PlaceCard } from '@/features/itinerary/place-card';
import type { PlanEditor } from '@/features/itinerary/plan-editor';
import {
  ALL_DAYS,
  defaultDaySelection,
  findDay,
  findPlace,
  IDEAS,
  isPendingId,
  resolveDaySelection,
  selectionPoints,
  type DaySelection,
} from '@/features/itinerary/plan-view';
import { PlannerCamera } from '@/features/itinerary/planner-camera';
import { ResultCard } from '@/features/itinerary/result-card';
import { RouteStatus } from '@/features/itinerary/route-status';
import { SavingIndicator } from '@/features/itinerary/saving-indicator';
import { StopLeg } from '@/features/itinerary/stop-leg';
import { StopList } from '@/features/itinerary/stop-list';
import type { OpenSource } from '@/features/itinerary/stop-row';
import { planPins } from '@/features/itinerary/trip-to-geojson';
import { usePlanActions } from '@/features/itinerary/use-plan-actions';
import { usePlannerParams } from '@/features/itinerary/use-planner-params';
import { useSelectionRoute } from '@/features/itinerary/use-selection-route';
import { PlaceSearch, WhatsHereCard } from '@/features/place-search';
import { planQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { AppBar } from '@/shared/components/app-bar/app-bar';
import { BottomSheet, PANEL_QUERY, type Snap } from '@/shared/components/bottom-sheet/bottom-sheet';
import { Button } from '@/shared/components/button/button';
import { buttonClassName, iconButtonClassName } from '@/shared/components/button/button-class';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useOnline } from '@/shared/hooks/use-online';
import { ChevronLeft, Ellipsis, ListOrdered } from '@/shared/icons/icons';
import { DraftPin } from '@/shared/map/draft-pin';
import { LongPressHandler } from '@/shared/map/long-press';
import { PinsLayer } from '@/shared/map/pins-layer';
import { RouteLineLayer } from '@/shared/map/route-line-layer';
import { TripMap } from '@/shared/map/trip-map';
import { useMapPadding } from '@/shared/map/use-map-padding';
import { CommunitySlot } from './community-slot';
import { initialMapView } from './initial-map-view';
import styles from './planner-screen.module.css';

const SNAP_ORDER: readonly Snap[] = ['peek', 'half', 'full'];

interface Draft {
  point: LngLat;
  /** `press`: long-press or right-click; `here`: the "Add here" crosshair follows the map centre. */
  mode: 'press' | 'here';
  focus: boolean;
}

interface Candidate {
  result: PlaceResult;
  focus: boolean;
}

interface PlannerScreenProps {
  tripId: string;
  initialPlan: TripPlanOwner;
  /** When the server render fetched `initialPlan` (ms): the query refetches once it is stale. */
  initialUpdatedAt: number;
}

function MapPadding({ bottom }: { bottom: number }) {
  useMapPadding({ bottom });
  return null;
}

/**
 * The planner (owner). URL (`day`, `place`, `mode`) + the cached plan are the
 * only truth; list, map and cards derive from them. Local state holds only
 * what the URL does not: sheet snap, search result or draft pin on screen.
 */
export function PlannerScreen({ tripId, initialPlan, initialUpdatedAt }: PlannerScreenProps) {
  const t = useTranslations('itinerary');
  const locale = useLocale();
  const { data } = useQuery({
    ...planQuery(tripId),
    initialData: initialPlan,
    initialDataUpdatedAt: initialUpdatedAt,
  });
  const plan = data.viewerRole === 'owner' ? data : initialPlan;
  const params = usePlannerParams({ modePerDay: true });
  // Without `?day=` the first render's day stays selected while the plan is edited.
  const [openingDay] = useState(() => defaultDaySelection(initialPlan));
  const selection = resolveDaySelection(plan, params.day ?? openingDay);
  const selectedPlace = params.place === null ? undefined : findPlace(plan, params.place);
  const online = useOnline();
  const wide = useMediaQuery(PANEL_QUERY);

  const [snap, setSnap] = useState<Snap>(openingDay === IDEAS ? 'peek' : 'half');
  const [sheetHeight, setSheetHeight] = useState(0);
  const [centre, setCentre] = useState<MapCentre | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusCard, setFocusCard] = useState(false);
  const [mapView] = useState(() => initialMapView(initialPlan));
  const [optimising, setOptimising] = useState(false);
  const whatsHereRef = useRef<HTMLDivElement>(null);
  // Whether the next search pick comes from Enter (keyboard) rather than a tap or click.
  const pickedByKey = useRef(false);

  const actions = usePlanActions(tripId, (tripPlaceId) => {
    setCandidate(null);
    setDraft(null);
    setFocusCard(false);
    void params.selectPlace(tripPlaceId);
  });
  const editor: PlanEditor = { actions, disabled: !online };

  const targetDay =
    selection === IDEAS || selection === ALL_DAYS ? undefined : findDay(plan, selection);
  const route = useSelectionRoute({
    source: { tripId },
    plan,
    selection,
    mode: params.mode,
  });

  function changeDayMode(mode: TravelMode) {
    void params.selectMode(mode);
    if (targetDay) {
      actions.setDayMode(targetDay.id, mode);
    }
  }
  const addLabel = targetDay
    ? t('card.addToDay', { number: targetDay.number })
    : t('card.addToIdeas');

  function openPlace(tripPlaceId: string, source: OpenSource) {
    setCandidate(null);
    setDraft(null);
    setFocusCard(source === 'keyboard');
    setSnap('half');
    void params.selectPlace(tripPlaceId);
  }

  function selectDay(next: DaySelection) {
    setCandidate(null);
    setDraft(null);
    void params.selectDay(next);
  }

  function showResult(result: PlaceResult, focus: boolean) {
    const existing = plan.places.find(
      (entry) => result.placeId !== null && entry.place.id === result.placeId,
    );
    if (existing) {
      openPlace(existing.id, focus ? 'keyboard' : 'pointer');
      return;
    }
    setDraft(null);
    setCandidate({ result, focus });
    setSnap('half');
  }

  function addResult(result: PlaceResult) {
    actions.add({
      place: { type: 'osm', key: result.key },
      preview: {
        source: 'osm',
        key: result.key,
        name: result.name,
        label: result.label,
        category: result.category,
        location: result.location,
        countryCode: result.address.countryCode?.toUpperCase() ?? null,
      },
      rating: result.rating,
      dayId: targetDay?.id ?? null,
    });
  }

  function addCustom({ name, location }: { name: string; location: LngLat }) {
    actions.add({
      place: { type: 'custom', name, category: 'other', location },
      preview: {
        source: 'custom',
        key: null,
        name,
        label: null,
        category: 'other',
        location,
        countryCode: null,
      },
      rating: null,
      dayId: targetDay?.id ?? null,
    });
  }

  function toggleAddHere(source: OpenSource) {
    if (draft?.mode === 'here') {
      setDraft(null);
      return;
    }
    const point = centre?.center ?? initialPlan.trip.destination?.center;
    if (!point) {
      return;
    }
    setCandidate(null);
    setDraft({ point, mode: 'here', focus: source === 'keyboard' });
    setSnap('half');
  }

  function handleCentre(next: MapCentre) {
    setCentre(next);
    if (draft?.mode === 'here') {
      setDraft({ ...draft, point: next.center });
    }
  }

  function handlePinSelect(tripPlaceId: string | null) {
    if (tripPlaceId === null) {
      if (selectedPlace) {
        void params.selectPlace(null);
      }
      return;
    }
    openPlace(tripPlaceId, 'pointer');
  }

  const handleLabel = (current: Snap, next: Snap) =>
    t('sheet.handle', {
      state: t(`sheet.snap.${current}`),
      action:
        SNAP_ORDER.indexOf(next) > SNAP_ORDER.indexOf(current)
          ? t('sheet.expand')
          : t('sheet.collapse'),
    });

  const focus = candidate?.result.location ?? selectedPlace?.place.location ?? null;

  function body() {
    if (candidate) {
      return (
        <ResultCard
          result={candidate.result}
          addLabel={addLabel}
          adding={actions.adding}
          disabled={!online}
          autoFocus={candidate.focus}
          onAdd={() => addResult(candidate.result)}
          onClose={() => setCandidate(null)}
        />
      );
    }
    if (draft) {
      return (
        <div ref={whatsHereRef}>
          <WhatsHereCard
            point={draft.point}
            addLabel={addLabel}
            adding={actions.adding}
            onPick={(result) => showResult(result, false)}
            onAddCustom={addCustom}
            onPointChange={(point) => setDraft({ ...draft, mode: 'press', point })}
            onClose={() => setDraft(null)}
          />
        </div>
      );
    }
    if (selectedPlace) {
      return (
        <PlaceCard
          plan={plan}
          tripPlaceId={selectedPlace.id}
          autoFocus={focusCard}
          onBack={() => void params.selectPlace(null)}
          communitySlot={
            isPendingId(selectedPlace.id) ? null : (
              <CommunitySlot place={selectedPlace} locale={locale} />
            )
          }
          owner={{ tripId, note: selectedPlace.note, editor }}
        />
      );
    }
    if (selection === IDEAS) {
      return <IdeasList plan={plan} selectedPlaceId={null} onOpen={openPlace} editor={editor} />;
    }
    if (selection === ALL_DAYS) {
      return <AllDaysList plan={plan} selectedPlaceId={null} onOpen={openPlace} />;
    }
    const day = route.day;
    const stopCount = targetDay?.stops.length ?? 0;
    return (
      <>
        {day ? (
          <RouteStatus
            view={day.view}
            stopCount={stopCount}
            mode={day.mode}
            onModeChange={changeDayMode}
            nameOf={(stopId) => {
              const stop = targetDay?.stops.find((candidate) => candidate.id === stopId);
              return (stop && findPlace(plan, stop.tripPlaceId)?.place.name) ?? '';
            }}
            loading={day.loading}
            failed={day.failed}
            onRetry={day.retry}
            owner
            disabled={!online}
          />
        ) : null}
        <StopList
          plan={plan}
          dayId={selection}
          selectedPlaceId={null}
          onOpen={openPlace}
          editor={editor}
          legAfter={(stopId) =>
            day ? (
              <StopLeg
                plan={plan}
                route={day}
                stopId={stopId}
                onModeChange={actions.setLegMode}
                disabled={!online}
              />
            ) : null
          }
        />
        {targetDay && stopCount >= LIMITS.OPTIMISE_MIN_STOPS ? (
          <>
            <Button
              className={styles.optimise}
              disabled={!online}
              onClick={() => setOptimising(true)}
            >
              <ListOrdered size={20} />
              {t('optimise.open')}
            </Button>
            <OptimisePreview
              tripId={tripId}
              plan={plan}
              dayId={targetDay.id}
              open={optimising}
              onClose={() => setOptimising(false)}
              disabled={!online}
              onApply={(stopIds, previous) => {
                setOptimising(false);
                actions.applyOrder(targetDay.id, stopIds, previous);
              }}
            />
          </>
        ) : null}
      </>
    );
  }

  return (
    <div
      className={styles.screen}
      style={{ '--sheet-height': `${sheetHeight}px` } as CSSProperties}
    >
      <AppBar
        start={
          <Link
            href={routes.trips(locale)}
            aria-label={t('screen.back')}
            className={buttonClassName({ variant: 'ghost' }, iconButtonClassName)}
          >
            <ChevronLeft size={20} />
          </Link>
        }
        end={
          <>
            <SavingIndicator tripId={tripId} />
            <Link
              href={routes.tripSettings(locale, tripId)}
              aria-label={t('screen.settings')}
              className={buttonClassName({ variant: 'ghost' }, iconButtonClassName)}
            >
              <Ellipsis size={20} />
            </Link>
          </>
        }
      >
        <h1 className={styles.title}>{plan.trip.title}</h1>
      </AppBar>
      <div
        className={styles.search}
        onKeyDownCapture={(event) => {
          pickedByKey.current = event.key === 'Enter';
        }}
        onPointerDownCapture={() => {
          pickedByKey.current = false;
        }}
      >
        <PlaceSearch
          near={centre?.center}
          zoom={centre?.zoom}
          onSelect={(result) => showResult(result, pickedByKey.current)}
        />
      </div>
      <div className={styles.panelArea}>
        <a className={styles.skipLink} href="#planner-map">
          {t('screen.skipToMap')}
        </a>
        <BottomSheet
          snap={snap}
          onSnapChange={setSnap}
          onSnapSettled={setSheetHeight}
          labelledBy="planner-panel-heading"
          handleLabel={handleLabel}
          header={
            <>
              <h2 id="planner-panel-heading" className={styles.visuallyHidden}>
                {t('screen.panelHeading')}
              </h2>
              <DayChips
                plan={plan}
                selected={selection}
                onSelect={selectDay}
                onAddDay={actions.createDay}
                addDisabled={!online}
              />
              <DaySummary
                plan={plan}
                selection={selection}
                dateOf={(dayId) => findDay(plan, dayId)?.date ?? null}
                totals={
                  route.day?.view.totals
                    ? { ...route.day.view.totals, estimated: route.day.view.estimated }
                    : null
                }
                actions={
                  targetDay ? (
                    <DayMenu
                      dayId={targetDay.id}
                      number={targetDay.number}
                      stopCount={targetDay.stops.length}
                      editor={editor}
                      onDeleted={() => selectDay(IDEAS)}
                    />
                  ) : null
                }
              />
            </>
          }
        >
          <div className={styles.body}>{body()}</div>
        </BottomSheet>
      </div>
      <div id="planner-map" tabIndex={-1} className={styles.mapRegion}>
        <TripMap
          initialView={mapView}
          label={t('screen.mapLabel', { title: plan.trip.title })}
          geolocate
        >
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
            focus={focus}
          />
          <MapCentreTracker
            onChange={handleCentre}
            onUserPan={() => setSnap((current) => (current === 'full' ? 'half' : current))}
          />
          <MapPadding bottom={wide ? 0 : sheetHeight} />
          {online ? (
            <LongPressHandler
              onLongPress={([lng, lat]) => {
                setCandidate(null);
                setDraft({ point: { lng, lat }, mode: 'press', focus: false });
                setSnap('half');
              }}
            />
          ) : null}
          {draft ? (
            <DraftPin
              lngLat={[draft.point.lng, draft.point.lat]}
              autoFocus={draft.focus}
              onMove={([lng, lat]) => setDraft({ ...draft, mode: 'press', point: { lng, lat } })}
              onActivate={() => whatsHereRef.current?.querySelector<HTMLElement>('h2')?.focus()}
            />
          ) : null}
        </TripMap>
      </div>
      <div className={styles.floating}>
        <AddHereButton
          pressed={draft?.mode === 'here'}
          disabled={!online || (centre === null && !initialPlan.trip.destination?.center)}
          onPress={toggleAddHere}
        />
      </div>
    </div>
  );
}
