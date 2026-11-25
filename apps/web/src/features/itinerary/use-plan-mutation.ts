import type { TripPlan, TripPlanOwner } from '@heremita/shared';
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { queryKeys } from '@/lib/api/query-keys';
import { announce as announceText, showToast } from '@/shared/components/toast/toast-store';
import { isPendingId } from './plan-view';

/**
 * Real ids the server gave rows first shown with a `pending-` id, per query
 * client. Edits are serial: one queued behind an add or a new day was built
 * with the pending id, and is sent with the real one (a pending id must never
 * reach the API). Rollbacks map their snapshots the same way.
 */
const confirmedIds = new WeakMap<QueryClient, Map<string, string>>();

/** Records that the row shown as `pendingId` is `realId` on the server. */
export function confirmPendingId(client: QueryClient, pendingId: string, realId: string): void {
  if (!isPendingId(pendingId) || pendingId === realId) {
    return;
  }
  let ids = confirmedIds.get(client);
  if (!ids) {
    ids = new Map();
    confirmedIds.set(client, ids);
  }
  ids.set(pendingId, realId);
}

/** `value` with every confirmed pending id replaced by its real id (plain JSON-like data). */
export function withConfirmedIds<T>(client: QueryClient, value: T): T {
  const ids = confirmedIds.get(client);
  if (!ids || ids.size === 0) {
    return value;
  }
  const map = (current: unknown): unknown => {
    if (typeof current === 'string') {
      return ids.get(current) ?? current;
    }
    if (Array.isArray(current)) {
      return current.map(map);
    }
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, map(entry)]));
    }
    return current;
  };
  return map(value) as T;
}

export interface PlanMutationConfig<TVariables, TData> {
  tripId: string;
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** What the plan looks like if the call succeeds, shown at once. */
  optimistic?: (plan: TripPlanOwner, variables: TVariables) => TripPlanOwner;
  /** Read out once the optimistic plan is on screen; never again when a rollback replays it. */
  announce?: (plan: TripPlanOwner, variables: TVariables) => string;
  /** Toast text when the call fails (the plan is already rolled back). */
  failureMessage: (variables: TVariables, error: unknown) => string;
  onSuccess?: (data: TData, variables: TVariables, client: QueryClient) => void;
  /** The trip's place or day count changes: My trips shows counts. */
  changesCounts?: boolean;
  /** Whether sending the same payload again can help (no Retry on a stale order). */
  canRetry?: (error: unknown) => boolean;
}

/**
 * What an edit rolls back to: the plan as it was before its optimistic change.
 * `plan` is rewritten when an edit queued before this one fails, so a later
 * rollback never brings back a change the server refused.
 */
interface Snapshot {
  plan: TripPlan | undefined;
  /** This edit's optimistic change, applied again on top of a rolled-back plan. */
  redo: (plan: TripPlan) => TripPlan;
}

/**
 * The plan once `failed` is rolled back: its snapshot with the optimistic
 * changes of the edits still queued behind it applied again, in order. Each
 * of those edits now rolls back to a plan without the failed change.
 */
function rollBack(
  client: QueryClient,
  mutationKey: QueryKey,
  failed: Snapshot,
): TripPlan | undefined {
  const queued = client
    .getMutationCache()
    .findAll({ mutationKey, exact: true, status: 'pending' })
    .filter((mutation) => mutation.state.context !== failed)
    .sort((a, b) => a.mutationId - b.mutationId);
  let plan = failed.plan;
  for (const mutation of queued) {
    const snapshot = mutation.state.context as Snapshot | undefined;
    if (plan && snapshot) {
      snapshot.plan = plan;
      plan = snapshot.redo(plan);
    }
  }
  return plan;
}

/** Every plan edit of one trip shares this key: the app bar's "Saving…" counts them. */
export function planMutationKey(tripId: string) {
  return queryKeys.trips.trip(tripId);
}

/**
 * One plan mutation per §I.web.mutations: serial per trip (scope), never
 * retried by itself, optimistic on the cached plan, rolled back on failure to
 * the plan before it plus the edits still queued behind it, with a Retry
 * toast (same payload), and the plan
 * refetched once the last queued edit of the trip has settled.
 */
export function usePlanMutation<TVariables, TData>({
  tripId,
  mutationFn,
  optimistic,
  announce,
  failureMessage,
  onSuccess,
  changesCounts = false,
  canRetry = () => true,
}: PlanMutationConfig<TVariables, TData>) {
  const t = useTranslations('common.actions');
  const queryClient = useQueryClient();
  const planKey = queryKeys.trips.plan(tripId);
  const mutationKey = planMutationKey(tripId);

  const mutation = useMutation<TData, unknown, TVariables, Snapshot>({
    mutationKey,
    scope: { id: `plan:${tripId}` },
    retry: false,
    mutationFn: (variables) => mutationFn(withConfirmedIds(queryClient, variables)),
    onMutate: async (variables, { client }) => {
      await client.cancelQueries({ queryKey: planKey, exact: true });
      const plan = client.getQueryData<TripPlan>(planKey);
      const redo = (current: TripPlan): TripPlan =>
        current.viewerRole === 'owner' && optimistic
          ? optimistic(current, withConfirmedIds(client, variables))
          : current;
      if (plan?.viewerRole === 'owner' && optimistic) {
        // The plan may already show the real ids of rows these variables still call pending.
        const next = optimistic(plan, withConfirmedIds(client, variables));
        client.setQueryData<TripPlan>(planKey, next);
        if (announce) {
          announceText(announce(next, variables));
        }
      }
      return { plan, redo };
    },
    onError: (error, variables, snapshot, { client }) => {
      const plan = snapshot && rollBack(client, mutationKey, snapshot);
      if (plan) {
        // A snapshot taken before an earlier add was confirmed still holds its pending ids.
        client.setQueryData<TripPlan>(planKey, withConfirmedIds(client, plan));
      }
      showToast({
        message: failureMessage(variables, error),
        action: canRetry(error)
          ? { label: t('retry'), onAction: () => mutation.mutate(variables) }
          : undefined,
      });
    },
    onSuccess: (data, variables, _snapshot, { client }) => onSuccess?.(data, variables, client),
    onSettled: (_data, _error, _variables, _snapshot, { client }) => {
      if (changesCounts) {
        void client.invalidateQueries({ queryKey: queryKeys.trips.mine });
      }
      // A refetch while later edits are queued would show the plan without them.
      if (client.isMutating({ mutationKey }) === 1) {
        void client.invalidateQueries({ queryKey: planKey, exact: true });
      }
    },
  });

  return mutation;
}
