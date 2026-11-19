'use client';

import type { TravelMode } from '@heremita/shared';
import type { ReactNode } from 'react';
import { AllDaysList } from './all-days-list';
import type { RoutedPlan } from './day-route';
import { IdeasList } from './ideas-list';
import { PlaceCard } from './place-card';
import { ALL_DAYS, findDay, findPlace, IDEAS, type DaySelection } from './plan-view';
import { RouteStatus } from './route-status';
import { StopLeg } from './stop-leg';
import { StopList } from './stop-list';
import type { OpenSource } from './stop-row';
import type { SelectedDayRoute } from './use-selection-route';

interface ReadOnlyItineraryProps {
  plan: RoutedPlan;
  selection: DaySelection;
  selectedPlaceId: string | null;
  route: SelectedDayRoute | undefined;
  onOpen: (tripPlaceId: string, source: OpenSource) => void;
  onBack: () => void;
  /** Changes the route's mode in the URL only (nothing is saved). */
  onModeChange: (mode: TravelMode) => void;
  /** The card opened from the keyboard: focus goes to its heading. */
  focusCard: boolean;
  /** What others say about the selected place, composed by the page. */
  communitySlot: (tripPlaceId: string) => ReactNode;
}

/**
 * Body of a public or shared trip's panel: the selected place's card, or
 * the ideas, every day, or one day with its legs and mode switch. Nothing
 * here edits the trip; notes and dates are not part of a viewer's plan.
 */
export function ReadOnlyItinerary({
  plan,
  selection,
  selectedPlaceId,
  route,
  onOpen,
  onBack,
  onModeChange,
  focusCard,
  communitySlot,
}: ReadOnlyItineraryProps) {
  if (selectedPlaceId !== null && findPlace(plan, selectedPlaceId)) {
    return (
      <PlaceCard
        plan={plan}
        tripPlaceId={selectedPlaceId}
        autoFocus={focusCard}
        onBack={onBack}
        communitySlot={communitySlot(selectedPlaceId)}
      />
    );
  }
  if (selection === IDEAS) {
    return <IdeasList plan={plan} selectedPlaceId={null} onOpen={onOpen} />;
  }
  if (selection === ALL_DAYS) {
    return <AllDaysList plan={plan} selectedPlaceId={null} onOpen={onOpen} readOnly />;
  }
  const day = findDay(plan, selection);
  return (
    <>
      {route && day ? (
        <RouteStatus
          view={route.view}
          stopCount={day.stops.length}
          mode={route.mode}
          onModeChange={onModeChange}
          nameOf={(stopId) => {
            const stop = day.stops.find((candidate) => candidate.id === stopId);
            return (stop && findPlace(plan, stop.tripPlaceId)?.place.name) ?? '';
          }}
          loading={route.loading}
          failed={route.failed}
          onRetry={route.retry}
          owner={false}
        />
      ) : null}
      <StopList
        plan={plan}
        dayId={selection}
        selectedPlaceId={null}
        onOpen={onOpen}
        legAfter={(stopId) =>
          route ? <StopLeg plan={plan} route={route} stopId={stopId} /> : null
        }
      />
    </>
  );
}
