import type { TravelMode } from '@heremita/shared';
import type { MapRouteLine } from '@/shared/map/route-line-layer';
import { dayRouteLines, dayRouteView, type DayRouteView, type RoutedPlan } from './day-route';
import { ALL_DAYS, dayColorToken, findDay, findPlace, IDEAS, type DaySelection } from './plan-view';
import { useDayRoutes, type DayRouteState, type PlanSource } from './use-day-routes';

export interface SelectedDayRoute {
  dayId: string;
  view: DayRouteView;
  /** Mode the switch shows: the URL's, else the day's saved one. */
  mode: TravelMode;
  /** URL mode when it differs from the saved one (it overrides every leg). */
  override: TravelMode | null;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}

export interface SelectionRoute {
  /** The selected day's route; absent for Ideas and All. */
  day: SelectedDayRoute | undefined;
  /** Map lines: the selected day, or every day in All. */
  lines: MapRouteLine[];
  /** All shows every day at 60 %; a route being replaced is dimmed too. */
  dimmed: boolean;
}

/**
 * Route of what the list shows: the selected day (its legs, totals, mode,
 * load and failure state) and the map lines, from the routes of the
 * visible days (§I.web.screens "Routes UI").
 */
export function useSelectionRoute({
  source,
  plan,
  selection,
  mode,
}: {
  source: PlanSource;
  plan: RoutedPlan;
  selection: DaySelection;
  mode: TravelMode | null;
}): SelectionRoute {
  const all = selection === ALL_DAYS;
  const dayIds = all ? plan.days.map((day) => day.id) : selection === IDEAS ? [] : [selection];
  const states = useDayRoutes({ source, plan, dayIds, mode: all ? null : mode });
  const locationOf = (tripPlaceId: string) => findPlace(plan, tripPlaceId)?.place.location;

  const stateOf = (dayId: string): DayRouteState | undefined =>
    states.find((state) => state.dayId === dayId);

  const lines = plan.days.flatMap((day) => {
    const state = stateOf(day.id);
    if (!state) {
      return [];
    }
    return dayRouteLines({
      id: day.id,
      stops: day.stops,
      locationOf,
      colorToken: dayColorToken(day.number),
      route: state.route,
      failed: state.failed,
    });
  });

  const selected = all ? undefined : findDay(plan, selection);
  const selectedState = selected && stateOf(selected.id);
  const override = selected && mode !== null && mode !== selected.mode ? mode : null;

  return {
    day:
      selected && selectedState
        ? {
            dayId: selected.id,
            view: dayRouteView({
              stops: selected.stops,
              locationOf,
              dayMode: selected.mode,
              mode: override,
              summary: plan.routes.find((summary) => summary.dayId === selected.id),
              route: selectedState.stale ? undefined : selectedState.route,
              failed: selectedState.failed,
            }),
            mode: override ?? selected.mode,
            override,
            loading: selectedState.loading,
            failed: selectedState.failed,
            retry: selectedState.retry,
          }
        : undefined,
    lines,
    dimmed: all || (selectedState?.stale ?? false),
  };
}
