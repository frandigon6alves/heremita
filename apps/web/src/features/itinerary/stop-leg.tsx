'use client';

import type { TravelMode } from '@heremita/shared';
import { legMode, type RoutedPlan } from './day-route';
import { LegRow } from './leg-row';
import { findDay, findPlace } from './plan-view';
import type { SelectedDayRoute } from './use-selection-route';

interface StopLegProps {
  plan: RoutedPlan;
  route: SelectedDayRoute;
  /** The stop the leg leaves from. */
  stopId: string;
  /** Owner only: saves the leg's mode (`null` = the day's mode again). */
  onModeChange?: (stopId: string, mode: TravelMode | null) => void;
  disabled?: boolean;
}

/** The leg after a stop of the selected day, wired to its places and the day's route. */
export function StopLeg({ plan, route, stopId, onModeChange, disabled }: StopLegProps) {
  const day = findDay(plan, route.dayId);
  const index = day?.stops.findIndex((stop) => stop.id === stopId) ?? -1;
  const from = day?.stops[index];
  const to = day?.stops[index + 1];
  if (!day || !from || !to) {
    return null;
  }
  const toPlace = findPlace(plan, to.tripPlaceId)?.place;
  return (
    <LegRow
      leg={route.view.legs[index] ?? null}
      mode={legMode(from, day.mode, route.override)}
      toName={toPlace?.name ?? ''}
      from={findPlace(plan, from.tripPlaceId)?.place.location}
      to={toPlace?.location}
      disabled={disabled}
      onModeChange={
        onModeChange ? (mode) => onModeChange(from.id, mode === day.mode ? null : mode) : undefined
      }
    />
  );
}
