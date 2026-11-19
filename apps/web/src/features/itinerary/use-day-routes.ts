import type { DayRoute, TravelMode } from '@heremita/shared';
import { useQueries } from '@tanstack/react-query';
import { dayRouteQuery, sharedDayRouteQuery } from '@/lib/api/query-keys';
import type { RoutedPlan } from './day-route';

/** Where a plan was read: the owner's or a public trip by id (E40), a share link (E27). */
export type PlanSource = { tripId: string } | { shareToken: string };

export interface DayRouteState {
  dayId: string;
  /** The route on screen; while a new one loads, the previous one (`stale`). */
  route: DayRoute | undefined;
  /** A newer route is loading: the shown one is dimmed. */
  stale: boolean;
  /** A request is in flight (the progress bar). */
  loading: boolean;
  /** The request failed (legs fall back to straight-line estimates). */
  failed: boolean;
  retry: () => void;
}

interface DayRoutesInput {
  source: PlanSource;
  plan: RoutedPlan;
  /** Days whose route is on screen: the selected one, or every day in "Todos". */
  dayIds: readonly string[];
  /** URL mode; ignored where it equals the day's saved mode. */
  mode: TravelMode | null;
}

/**
 * Routes of the visible days (E40, or E27 on a share link). The key holds
 * `planVersion` + mode, so an edit that changes the route is a new request
 * and an unchanged plan reads the cache (V68). A day needs two stops.
 */
export function useDayRoutes({ source, plan, dayIds, mode }: DayRoutesInput): DayRouteState[] {
  const days = dayIds.flatMap((dayId) => {
    const day = plan.days.find((candidate) => candidate.id === dayId);
    return day ? [day] : [];
  });

  return useQueries({
    queries: days.map((day) => {
      const dayMode = mode === null || mode === day.mode ? null : mode;
      const options =
        'tripId' in source
          ? dayRouteQuery(source.tripId, day.id, plan.planVersion, dayMode)
          : sharedDayRouteQuery(source.shareToken, day.id, plan.planVersion, dayMode);
      return { ...options, enabled: day.stops.length > 1 };
    }),
    combine: (results) =>
      results.map((result, i) => ({
        dayId: days[i]?.id ?? '',
        route: result.data,
        stale: result.isPlaceholderData,
        loading: result.isFetching,
        failed: result.isError,
        retry: () => void result.refetch(),
      })),
  });
}
