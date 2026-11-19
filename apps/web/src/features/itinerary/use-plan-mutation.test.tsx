import type { TripPlan, TripPlanOwner } from '@heremita/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { resetToasts } from '@/shared/components/toast/toast-store';
import { TestIntlProvider } from '@/test-utils/render';
import { buildPlan, TRIP_ID } from './test-support';
import { usePlanMutation } from './use-plan-mutation';

const PLAN_KEY = queryKeys.trips.plan(TRIP_ID);

interface Deferred {
  promise: Promise<unknown>;
  reject: (error: Error) => void;
}

function deferred(): Deferred {
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise((_, fail) => {
    reject = fail;
  });
  return { promise, reject };
}

/** A plan edit that renames the trip: easy to tell which optimistic edits the cache shows. */
function setup() {
  const client = new QueryClient();
  client.setQueryData<TripPlan>(PLAN_KEY, buildPlan());
  const calls = new Map<string, Deferred>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TestIntlProvider locale="en">{children}</TestIntlProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      usePlanMutation<{ title: string }, unknown>({
        tripId: TRIP_ID,
        mutationFn: ({ title }) => {
          const call = deferred();
          calls.set(title, call);
          return call.promise;
        },
        optimistic: (plan, { title }): TripPlanOwner => ({
          ...plan,
          trip: { ...plan.trip, title },
        }),
        failureMessage: () => 'Not saved',
      }),
    { wrapper },
  );
  const title = () => (client.getQueryData<TripPlanOwner>(PLAN_KEY) ?? buildPlan()).trip.title;
  const fail = async (sent: string) => {
    await waitFor(() => expect(calls.has(sent)).toBe(true));
    await act(() => {
      calls.get(sent)!.reject(new TypeError('Failed to fetch'));
      return Promise.resolve();
    });
  };
  return { mutate: result.current.mutate, title, fail, original: buildPlan().trip.title };
}

afterEach(() => {
  resetToasts();
});

describe('usePlanMutation rollback with queued edits (V52)', () => {
  it('keeps_a_queued_edit_on_screen_when_the_edit_before_it_fails', async () => {
    const { mutate, title, fail } = setup();
    act(() => {
      mutate({ title: 'First' });
      mutate({ title: 'Second' });
    });
    await waitFor(() => expect(title()).toBe('Second'));

    await fail('First');

    await waitFor(() => expect(title()).toBe('Second'));
  });

  it('shows_none_of_the_failed_edits_once_every_queued_edit_failed', async () => {
    const { mutate, title, fail, original } = setup();
    act(() => {
      mutate({ title: 'First' });
      mutate({ title: 'Second' });
    });

    await fail('First');
    await fail('Second');

    await waitFor(() => expect(title()).toBe(original));
  });
});
