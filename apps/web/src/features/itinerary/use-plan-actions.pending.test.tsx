import { endpoints, type TripPlan, type TripPlanOwner } from '@heremita/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { TestIntlProvider } from '@/test-utils/render';
import { okResponse, onEndpoint, setupApiServer } from '../../../test/msw/handlers';
import { buildPlan, dayId, stopId, TRIP_ID } from './test-support';
import { usePlanActions } from './use-plan-actions';

const server = setupApiServer();
const PLAN_KEY = queryKeys.trips.plan(TRIP_ID);
const NEW_DAY = dayId(9);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<TripPlan>(PLAN_KEY, buildPlan());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TestIntlProvider locale="en">{children}</TestIntlProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => usePlanActions(TRIP_ID, () => {}), { wrapper });
  const plan = () => client.getQueryData<TripPlanOwner>(PLAN_KEY) ?? buildPlan();
  return { result, plan };
}

describe('usePlanActions with a day that is not confirmed yet', () => {
  it('sends_an_edit_queued_on_a_new_day_with_the_id_the_server_gave_it', async () => {
    let answerDay: () => void = () => {};
    const moves: unknown[] = [];
    server.use(
      onEndpoint(
        endpoints.createDay,
        () =>
          new Promise<Response>((resolve) => {
            answerDay = () =>
              resolve(
                okResponse(endpoints.createDay, {
                  day: {
                    id: NEW_DAY,
                    number: 3,
                    date: null,
                    mode: 'walk',
                    modeOverride: null,
                    stops: [],
                  },
                  planVersion: 8,
                }),
              );
          }),
      ),
      onEndpoint(endpoints.putStopPlacement, async ({ request, params }) => {
        moves.push({ stopId: params.stopId, body: await request.json() });
        return okResponse(endpoints.putStopPlacement, { planVersion: 9 });
      }),
    );
    const { result, plan } = setup();

    act(() => result.current.createDay());
    await waitFor(() => expect(plan().days).toHaveLength(3));
    const pendingDay = plan().days.at(-1)!.id;
    expect(pendingDay).toMatch(/^pending-/);
    // The owner moves a stop onto the new day before the server confirmed it.
    act(() =>
      result.current.move({ stopId: stopId(1), name: 'Castelo', dayId: pendingDay, index: 0 }),
    );
    act(() => answerDay());

    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toEqual({ stopId: stopId(1), body: { dayId: NEW_DAY, index: 0 } });
  });
});
