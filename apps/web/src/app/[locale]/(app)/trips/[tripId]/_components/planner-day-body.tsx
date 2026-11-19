'use client';

import { LIMITS, type TravelMode, type TripPlanOwner } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AllDaysList } from '@/features/itinerary/all-days-list';
import { IdeasList } from '@/features/itinerary/ideas-list';
import { OptimisePreview } from '@/features/itinerary/optimise-preview';
import type { PlanEditor } from '@/features/itinerary/plan-editor';
import {
  ALL_DAYS,
  findDay,
  findPlace,
  IDEAS,
  type DaySelection,
} from '@/features/itinerary/plan-view';
import { RouteStatus } from '@/features/itinerary/route-status';
import { StopLeg } from '@/features/itinerary/stop-leg';
import { StopList } from '@/features/itinerary/stop-list';
import type { OpenSource } from '@/features/itinerary/stop-row';
import type { SelectedDayRoute } from '@/features/itinerary/use-selection-route';
import { Button } from '@/shared/components/button/button';
import { ListOrdered } from '@/shared/icons/icons';
import styles from './planner-day-body.module.css';

interface PlannerDayBodyProps {
  tripId: string;
  plan: TripPlanOwner;
  selection: DaySelection;
  /** The selected day's route; absent for Ideas and All. */
  route: SelectedDayRoute | undefined;
  editor: PlanEditor;
  onOpen: (tripPlaceId: string, source: OpenSource) => void;
  onDayModeChange: (mode: TravelMode) => void;
}

/** The panel when no card is open: the ideas, every day, or one day with its route and "Optimise". */
export function PlannerDayBody({
  tripId,
  plan,
  selection,
  route,
  editor,
  onOpen,
  onDayModeChange,
}: PlannerDayBodyProps) {
  const t = useTranslations('itinerary');
  const [optimising, setOptimising] = useState(false);

  if (selection === IDEAS) {
    return <IdeasList plan={plan} selectedPlaceId={null} onOpen={onOpen} editor={editor} />;
  }
  if (selection === ALL_DAYS) {
    return <AllDaysList plan={plan} selectedPlaceId={null} onOpen={onOpen} />;
  }
  const day = findDay(plan, selection);
  const stopCount = day?.stops.length ?? 0;
  const offline = editor.disabled;

  return (
    <>
      {route ? (
        <RouteStatus
          view={route.view}
          stopCount={stopCount}
          mode={route.mode}
          onModeChange={onDayModeChange}
          nameOf={(stopId) => {
            const stop = day?.stops.find((candidate) => candidate.id === stopId);
            return (stop && findPlace(plan, stop.tripPlaceId)?.place.name) ?? '';
          }}
          loading={route.loading}
          failed={route.failed}
          onRetry={route.retry}
          owner
          disabled={offline}
        />
      ) : null}
      <StopList
        plan={plan}
        dayId={selection}
        selectedPlaceId={null}
        onOpen={onOpen}
        editor={editor}
        legAfter={(stopId) =>
          route ? (
            <StopLeg
              plan={plan}
              route={route}
              stopId={stopId}
              onModeChange={editor.actions.setLegMode}
              disabled={offline}
            />
          ) : null
        }
      />
      {day && stopCount >= LIMITS.OPTIMISE_MIN_STOPS ? (
        <>
          <Button
            className={styles.optimise}
            disabled={offline}
            onClick={() => setOptimising(true)}
          >
            <ListOrdered size={20} />
            {t('optimise.open')}
          </Button>
          <OptimisePreview
            tripId={tripId}
            plan={plan}
            dayId={day.id}
            open={optimising}
            onClose={() => setOptimising(false)}
            disabled={offline}
            onApply={(stopIds, previous) => {
              setOptimising(false);
              editor.actions.applyOrder(day.id, stopIds, previous);
            }}
          />
        </>
      ) : null}
    </>
  );
}
