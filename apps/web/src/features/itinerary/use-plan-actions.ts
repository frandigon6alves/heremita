import {
  endpoints,
  type AddTripPlaceBody,
  type AddTripPlaceResponse,
  type DayOwner,
  type PlaceSummary,
  type RatingSummary,
  type TripPlan,
  type TravelMode,
  type TripPlaceOwner,
  type TripPlanOwner,
} from '@heremita/shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api/client';
import { ApiProblemError } from '@/lib/api/problem';
import { queryKeys } from '@/lib/api/query-keys';
import { announce, showToast } from '@/shared/components/toast/toast-store';
import {
  applyAddStop,
  applyAddTripPlace,
  applyConfirmedAdd,
  applyCreateDay,
  applyDeleteDay,
  applyDeleteTripPlace,
  applyLegMode,
  applyMoveStop,
  applyRemoveStop,
  applyReorder,
} from './apply-plan-ops';
import { findDay, findPlace, newPendingId, stopsOfPlace } from './plan-view';
import { usePlanMutation } from './use-plan-mutation';

type PlaceInput = AddTripPlaceBody['place'];

export interface AddPlaceRequest {
  place: PlaceInput;
  /** What the row and pin show until the server answers. */
  preview: Omit<PlaceSummary, 'id'>;
  rating: RatingSummary | null;
  /** `null` adds it to the ideas. */
  dayId: string | null;
  note?: string | null;
  /** Stops it gets on top of `dayId` (Undo of a delete puts it back on every day it was). */
  extraStops?: readonly { dayId: string; index: number }[];
  index?: number;
}

interface AddVariables extends AddPlaceRequest {
  pendingId: string;
  pendingStopId: string | null;
  /** Day number or `ideas`, for the toasts. */
  target: string;
}

type AddResult =
  | { kind: 'created'; tripPlaceId: string; response: AddTripPlaceResponse }
  | { kind: 'existing'; tripPlaceId: string; stopId: string | null };

interface MoveVariables {
  stopId: string;
  name: string;
  dayId: string;
  index: number;
}

interface TargetedMove extends MoveVariables {
  target: string;
}

interface StopVariables {
  stopId: string;
  name: string;
  dayId: string;
  index: number;
  tripPlaceId: string;
}

interface TargetedStop extends StopVariables {
  target: string;
}

interface OrderVariables {
  dayId: string;
  stopIds: readonly string[];
  /** The order before, for Undo. */
  previous: readonly string[];
  /** Undo of an earlier order change: no further Undo toast. */
  undo: boolean;
}

interface DeletePlaceVariables {
  tripPlace: TripPlaceOwner;
  stops: readonly { dayId: string; index: number }[];
}

const EMPTY_RATING: RatingSummary = { count: 0, average: null, distribution: null };

function readOwnerPlan(client: QueryClient, tripId: string): TripPlanOwner | null {
  const plan = client.getQueryData<TripPlan>(queryKeys.trips.plan(tripId));
  return plan?.viewerRole === 'owner' ? plan : null;
}

function errorCode(error: unknown): string | null {
  return error instanceof ApiProblemError ? error.code : null;
}

function restoreInput(tripPlace: TripPlaceOwner): PlaceInput {
  const { place } = tripPlace;
  if (place.source === 'osm' && place.key !== null) {
    return { type: 'osm', key: place.key };
  }
  return { type: 'custom', name: place.name, category: place.category, location: place.location };
}

/**
 * Every plan edit the planner offers (§I.web.mutations), each one an
 * optimistic, serial, rolled-back-on-failure mutation; deletes come with Undo.
 * `onAdded` receives the trip place an add ended on, to select it.
 */
export function usePlanActions(tripId: string, onAdded: (tripPlaceId: string) => void) {
  const t = useTranslations('itinerary.toasts');
  const tActions = useTranslations('common.actions');

  const queryClient = useQueryClient();

  /** The day number (or `ideas`) read before the edit: toasts keep it even if days renumber. */
  function targetName(dayId: string | null): string {
    const plan = readOwnerPlan(queryClient, tripId);
    const day = dayId !== null && plan ? findDay(plan, dayId) : undefined;
    return day ? String(day.number) : 'ideas';
  }

  const addPlace = usePlanMutation<AddVariables, AddResult>({
    tripId,
    changesCounts: true,
    mutationFn: async ({ place, note, dayId, index, extraStops = [] }) => {
      const schedule = dayId === null ? null : { dayId, index };
      try {
        const response = await apiFetch(endpoints.addTripPlace, {
          params: { tripId },
          body: { place, note: note ?? null, schedule },
        });
        for (const stop of extraStops) {
          await apiFetch(endpoints.addStop, {
            params: { tripId, dayId: stop.dayId },
            body: { tripPlaceId: response.tripPlace.id, index: stop.index },
          });
        }
        return { kind: 'created', tripPlaceId: response.tripPlace.id, response };
      } catch (error) {
        const existing = error instanceof ApiProblemError ? error.tripPlaceId : undefined;
        if (errorCode(error) !== 'place_already_in_trip' || existing === undefined) {
          throw error;
        }
        if (schedule === null) {
          return { kind: 'existing', tripPlaceId: existing, stopId: null };
        }
        const added = await apiFetch(endpoints.addStop, {
          params: { tripId, dayId: schedule.dayId },
          body: { tripPlaceId: existing, index: schedule.index },
        });
        return { kind: 'existing', tripPlaceId: existing, stopId: added.stop.id };
      }
    },
    optimistic: (plan, { pendingId, pendingStopId, preview, rating, note, dayId, index }) =>
      applyAddTripPlace(
        plan,
        {
          id: pendingId,
          place: { ...preview, id: pendingId },
          rating: rating ?? EMPTY_RATING,
          note: note ?? null,
          addedAt: new Date().toISOString(),
        },
        dayId === null || pendingStopId === null ? null : { dayId, index, stopId: pendingStopId },
      ),
    failureMessage: ({ preview, target }, error) => {
      const code = errorCode(error);
      if (code === 'day_full') {
        return t('dayFull', { target });
      }
      if (code === 'limit_reached') {
        return t('placeLimit');
      }
      return t('addFailed', { name: preview.name });
    },
    onSuccess: (result, variables, client) => {
      const { pendingId, pendingStopId, dayId, preview, target } = variables;
      client.setQueryData<TripPlan>(queryKeys.trips.plan(tripId), (plan) => {
        if (plan?.viewerRole !== 'owner') {
          return plan;
        }
        return result.kind === 'created'
          ? applyConfirmedAdd(
              plan,
              { tripPlaceId: pendingId, stopId: pendingStopId },
              result.response,
            )
          : applyDeleteTripPlace(plan, pendingId);
      });
      onAdded(result.tripPlaceId);
      if (result.kind === 'existing' && result.stopId === null) {
        return;
      }
      showToast({
        message: t('added', { name: preview.name, target }),
        action: {
          label: tActions('undo'),
          onAction: () => {
            if (result.kind === 'created') {
              const plan = readOwnerPlan(client, tripId);
              const tripPlace = plan && findPlace(plan, result.tripPlaceId);
              if (tripPlace) {
                deletePlace.mutate({ tripPlace, stops: [] });
              }
            } else if (result.stopId !== null && dayId !== null) {
              removeStop.mutate({
                stopId: result.stopId,
                name: preview.name,
                dayId,
                index: 0,
                tripPlaceId: result.tripPlaceId,
                target,
              });
            }
          },
        },
      });
    },
  });

  const moveStop = usePlanMutation<TargetedMove, unknown>({
    tripId,
    mutationFn: ({ stopId, dayId, index }) =>
      apiFetch(endpoints.putStopPlacement, {
        params: { tripId, stopId },
        body: { dayId, index },
      }),
    optimistic: (plan, { stopId, dayId, index }) => applyMoveStop(plan, stopId, dayId, index),
    announce: (moved, { stopId, dayId, name, target }) => {
      const stops = findDay(moved, dayId)?.stops ?? [];
      const position = stops.findIndex((stop) => stop.id === stopId) + 1;
      return t('moved', { name, position, total: stops.length, target });
    },
    failureMessage: ({ name, target }, error) =>
      errorCode(error) === 'day_full' ? t('dayFull', { target }) : t('moveFailed', { name }),
  });

  const addStop = usePlanMutation<TargetedStop, unknown>({
    tripId,
    mutationFn: ({ dayId, tripPlaceId, index }) =>
      apiFetch(endpoints.addStop, { params: { tripId, dayId }, body: { tripPlaceId, index } }),
    optimistic: (plan, { dayId, tripPlaceId, index, stopId }) =>
      applyAddStop(plan, dayId, { id: stopId, tripPlaceId, modeToNext: null }, index),
    failureMessage: ({ name, target }, error) =>
      errorCode(error) === 'day_full' ? t('dayFull', { target }) : t('moveFailed', { name }),
  });

  const removeStop = usePlanMutation<TargetedStop, unknown>({
    tripId,
    mutationFn: ({ stopId }) => apiFetch(endpoints.deleteStop, { params: { tripId, stopId } }),
    optimistic: (plan, { stopId }) => applyRemoveStop(plan, stopId),
    failureMessage: ({ name }) => t('removeFailed', { name }),
    onSuccess: (_data, variables) => {
      showToast({
        message: t('removed', { name: variables.name, target: variables.target }),
        action: {
          label: tActions('undo'),
          onAction: () => addStop.mutate({ ...variables, stopId: newPendingId() }),
        },
      });
    },
  });

  const deletePlace = usePlanMutation<DeletePlaceVariables, unknown>({
    tripId,
    changesCounts: true,
    mutationFn: ({ tripPlace }) =>
      apiFetch(endpoints.deleteTripPlace, { params: { tripId, tripPlaceId: tripPlace.id } }),
    optimistic: (plan, { tripPlace }) => applyDeleteTripPlace(plan, tripPlace.id),
    failureMessage: ({ tripPlace }) => t('deleteFailed', { name: tripPlace.place.name }),
    onSuccess: (_data, { tripPlace, stops }) => {
      const [first, ...others] = stops;
      showToast({
        message: t('deleted', { name: tripPlace.place.name }),
        action: {
          label: tActions('undo'),
          onAction: () =>
            add({
              place: restoreInput(tripPlace),
              preview: tripPlace.place,
              rating: tripPlace.rating,
              note: tripPlace.note,
              dayId: first?.dayId ?? null,
              index: first?.index,
              extraStops: others,
            }),
        },
      });
    },
  });

  const createDay = usePlanMutation<{ pendingId: string }, DayOwner>({
    tripId,
    changesCounts: true,
    mutationFn: async () => {
      const { day } = await apiFetch(endpoints.createDay, { params: { tripId }, body: {} });
      return day;
    },
    optimistic: (plan, { pendingId }) => {
      const last = plan.days.at(-1);
      return applyCreateDay(plan, {
        id: pendingId,
        number: plan.days.length + 1,
        date: null,
        mode: last?.mode ?? plan.trip.defaultMode,
        modeOverride: null,
        stops: [],
      });
    },
    failureMessage: () => t('createDayFailed'),
    onSuccess: (day, { pendingId }, client) => {
      client.setQueryData<TripPlan>(queryKeys.trips.plan(tripId), (plan) =>
        plan?.viewerRole === 'owner'
          ? {
              ...plan,
              days: plan.days.map((candidate) => (candidate.id === pendingId ? day : candidate)),
            }
          : plan,
      );
    },
  });

  const deleteDay = usePlanMutation<{ dayId: string; number: number }, unknown>({
    tripId,
    changesCounts: true,
    mutationFn: ({ dayId }) => apiFetch(endpoints.deleteDay, { params: { tripId, dayId } }),
    optimistic: (plan, { dayId }) => applyDeleteDay(plan, dayId),
    failureMessage: ({ number }) => t('deleteDayFailed', { number }),
    onSuccess: (_data, { number }) => announce(t('dayDeleted', { number })),
  });

  // Not optimistic: the URL already shows the mode, and the saved one must arrive with
  // the plan version it bumps, or the route key would reuse the old mode's route.
  const dayMode = usePlanMutation<{ dayId: string; mode: TravelMode }, unknown>({
    tripId,
    mutationFn: ({ dayId, mode }) =>
      apiFetch(endpoints.updateDay, { params: { tripId, dayId }, body: { modeOverride: mode } }),
    failureMessage: () => t('modeFailed'),
  });

  const legMode = usePlanMutation<{ stopId: string; mode: TravelMode | null }, unknown>({
    tripId,
    mutationFn: ({ stopId, mode }) =>
      apiFetch(endpoints.updateStop, { params: { tripId, stopId }, body: { modeToNext: mode } }),
    optimistic: (plan, { stopId, mode }) => applyLegMode(plan, stopId, mode),
    failureMessage: () => t('modeFailed'),
  });

  const order = usePlanMutation<OrderVariables, unknown>({
    tripId,
    mutationFn: ({ dayId, stopIds }) =>
      apiFetch(endpoints.putStopOrder, {
        params: { tripId, dayId },
        body: { stopIds: [...stopIds] },
      }),
    optimistic: (plan, { dayId, stopIds }) => applyReorder(plan, dayId, stopIds),
    canRetry: (error) => errorCode(error) !== 'plan_changed',
    failureMessage: (_variables, error) =>
      errorCode(error) === 'plan_changed' ? t('planChanged') : t('orderFailed'),
    onSuccess: (_data, variables) => {
      if (variables.undo) {
        announce(t('orderRestored'));
        return;
      }
      showToast({
        message: t('ordered'),
        action: {
          label: tActions('undo'),
          onAction: () =>
            order.mutate({
              dayId: variables.dayId,
              stopIds: variables.previous,
              previous: variables.stopIds,
              undo: true,
            }),
        },
      });
    },
  });

  function add(request: AddPlaceRequest) {
    addPlace.mutate({
      ...request,
      pendingId: newPendingId(),
      pendingStopId: request.dayId === null ? null : newPendingId(),
      target: targetName(request.dayId),
    });
  }

  return {
    add,
    /** Moves a stop to `index` of `dayId` (same day: reorder). */
    move: (variables: MoveVariables) =>
      moveStop.mutate({ ...variables, target: targetName(variables.dayId) }),
    /** Puts a trip place on a day (it may already be on others). */
    schedule: (variables: Omit<StopVariables, 'stopId'>) =>
      addStop.mutate({
        ...variables,
        stopId: newPendingId(),
        target: targetName(variables.dayId),
      }),
    removeFromDay: (variables: StopVariables) =>
      removeStop.mutate({ ...variables, target: targetName(variables.dayId) }),
    deleteFromTrip: (tripPlaceId: string) => {
      const plan = readOwnerPlan(queryClient, tripId);
      const tripPlace = plan && findPlace(plan, tripPlaceId);
      if (plan && tripPlace) {
        deletePlace.mutate({
          tripPlace,
          stops: stopsOfPlace(plan, tripPlaceId).map(({ dayId, index }) => ({ dayId, index })),
        });
      }
    },
    /** Appends a day; a failure is already a toast. */
    createDay: () => {
      createDay.mutate({ pendingId: newPendingId() });
    },
    moveToNewDay: async ({ stopId, name }: { stopId: string; name: string }) => {
      const day = await createDay.mutateAsync({ pendingId: newPendingId() }).catch(() => null);
      if (day) {
        moveStop.mutate({ stopId, name, dayId: day.id, index: 0, target: targetName(day.id) });
      }
    },
    scheduleOnNewDay: async ({ tripPlaceId, name }: { tripPlaceId: string; name: string }) => {
      const day = await createDay.mutateAsync({ pendingId: newPendingId() }).catch(() => null);
      if (day) {
        addStop.mutate({
          tripPlaceId,
          name,
          dayId: day.id,
          index: 0,
          stopId: newPendingId(),
          target: targetName(day.id),
        });
      }
    },
    deleteDay: (dayId: string, number: number) => deleteDay.mutate({ dayId, number }),
    /** Saves the day's mode (the URL already shows it). */
    setDayMode: (dayId: string, mode: TravelMode) => dayMode.mutate({ dayId, mode }),
    /** `null` = the leg follows the day's mode again. */
    setLegMode: (stopId: string, mode: TravelMode | null) => legMode.mutate({ stopId, mode }),
    /** Applies a suggested order (E36); Undo puts the previous one back. */
    applyOrder: (dayId: string, stopIds: readonly string[], previous: readonly string[]) =>
      order.mutate({ dayId, stopIds, previous, undo: false }),
    adding: addPlace.isPending,
  };
}

export type PlanActions = ReturnType<typeof usePlanActions>;
