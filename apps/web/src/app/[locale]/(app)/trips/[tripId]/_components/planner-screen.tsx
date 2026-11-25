'use client';

import type { LngLat, PlaceResult, TravelMode, TripPlanOwner } from '@heremita/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AddHereButton } from '@/features/itinerary/add-here-button';
import { DayChips } from '@/features/itinerary/day-chips';
import { DayMenu } from '@/features/itinerary/day-menu';
import { DaySummary } from '@/features/itinerary/day-summary';
import { MapCentreTracker, type MapCentre } from '@/features/itinerary/map-centre-tracker';
import type { PlanEditor } from '@/features/itinerary/plan-editor';
import {
  ALL_DAYS,
  defaultDaySelection,
  findDay,
  findPlace,
  IDEAS,
  resolveDaySelection,
  selectionPoints,
  type DaySelection,
} from '@/features/itinerary/plan-view';
import { PlannerCamera } from '@/features/itinerary/planner-camera';
import { SavingIndicator } from '@/features/itinerary/saving-indicator';
import type { OpenSource } from '@/features/itinerary/stop-row';
import { planPins } from '@/features/itinerary/trip-to-geojson';
import { usePlanActions } from '@/features/itinerary/use-plan-actions';
import { usePlannerParams } from '@/features/itinerary/use-planner-params';
import { useSelectionRoute } from '@/features/itinerary/use-selection-route';
import { PlaceSearch } from '@/features/place-search';
import { planQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { AppBar } from '@/shared/components/app-bar/app-bar';
import type { Snap } from '@/shared/components/bottom-sheet/bottom-sheet';
import { buttonClassName, iconButtonClassName } from '@/shared/components/button/button-class';
import { useOnline } from '@/shared/hooks/use-online';
import { ChevronLeft, Ellipsis } from '@/shared/icons/icons';
import { DraftPin } from '@/shared/map/draft-pin';
import { LongPressHandler } from '@/shared/map/long-press';
import { PinsLayer } from '@/shared/map/pins-layer';
import { RouteLineLayer } from '@/shared/map/route-line-layer';
import { initialMapView } from '../../../../_components/trip/initial-map-view';
import { TripScreenShell, TripScreenTitle } from '../../../../_components/trip/trip-screen-shell';
import { PlannerDayBody } from './planner-day-body';
import { PlannerOverlayCard, type PlannerOverlay } from './planner-overlay-card';

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

  const [snap, setSnap] = useState<Snap>(openingDay === IDEAS ? 'peek' : 'half');
  const [centre, setCentre] = useState<MapCentre | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusCard, setFocusCard] = useState(false);
  const [mapView] = useState(() => initialMapView(initialPlan));
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

  const focus = candidate?.result.location ?? selectedPlace?.place.location ?? null;

  function overlay(): PlannerOverlay | null {
    if (candidate) {
      return { kind: 'result', result: candidate.result, focus: candidate.focus };
    }
    if (draft) {
      return { kind: 'draft', point: draft.point };
    }
    return selectedPlace ? { kind: 'place', tripPlace: selectedPlace, focus: focusCard } : null;
  }
  const shown = overlay();

  function closeOverlay() {
    if (candidate) {
      setCandidate(null);
    } else if (draft) {
      setDraft(null);
    } else {
      void params.selectPlace(null);
    }
  }

  return (
    <TripScreenShell
      id="planner"
      appBar={
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
          <TripScreenTitle>{plan.trip.title}</TripScreenTitle>
        </AppBar>
      }
      search={
        <div
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
      }
      panelHeading={t('screen.panelHeading')}
      snap={snap}
      onSnapChange={setSnap}
      header={
        <>
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
      mapView={mapView}
      mapLabel={t('screen.mapLabel', { title: plan.trip.title })}
      geolocate
      mapLayers={
        <>
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
        </>
      }
      floating={
        <AddHereButton
          pressed={draft?.mode === 'here'}
          disabled={!online || (centre === null && !initialPlan.trip.destination?.center)}
          onPress={toggleAddHere}
        />
      }
    >
      {shown ? (
        <PlannerOverlayCard
          overlay={shown}
          tripId={tripId}
          plan={plan}
          locale={locale}
          editor={editor}
          addLabel={addLabel}
          whatsHereRef={whatsHereRef}
          onAddResult={addResult}
          onPickNearby={(result) => showResult(result, false)}
          onAddCustom={addCustom}
          onDraftPointChange={(point) => setDraft(draft && { ...draft, mode: 'press', point })}
          onClose={closeOverlay}
        />
      ) : (
        <PlannerDayBody
          tripId={tripId}
          plan={plan}
          selection={selection}
          route={route.day}
          editor={editor}
          onOpen={openPlace}
          onDayModeChange={changeDayMode}
          onAddSuggestion={addResult}
          // The dialog's button unmounts with the panel: the card takes the focus.
          onShowSuggestion={(result) => showResult(result, true)}
        />
      )}
    </TripScreenShell>
  );
}
