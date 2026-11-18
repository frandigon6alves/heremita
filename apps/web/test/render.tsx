import type { Locale, Me } from '@heremita/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import type { ReactElement, ReactNode } from 'react';
import { queryKeys } from '@/lib/api/query-keys';
import { TestIntlProvider } from '@/test-utils/render';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Page URL whose search params the nuqs adapter starts from, e.g. `/pt-BR/trips/1?day=ideas`. */
  route?: string;
  /** Defaults to `en` so assertions read in the source language. */
  locale?: Locale;
  /** Seeds the `['viewer']` query: a user, `null` (signed out) or omitted (not loaded). */
  viewer?: Me | null;
  /** Options for `userEvent.setup()`, e.g. `advanceTimers` with fake timers. */
  userOptions?: Parameters<typeof userEvent.setup>[0];
}

export interface RenderWithProvidersResult extends RenderResult {
  user: UserEvent;
  queryClient: QueryClient;
  /** Every URL update nuqs made, newest last (`event.queryString`, `event.options.history`). */
  urlUpdates: Parameters<OnUrlUpdateFunction>[0][];
}

/** No retries and no background refetches: a test sees exactly the responses it mocked. */
function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders `ui` the way the app's providers wrap a page: a fresh query client,
 * the intl provider with the real catalogue (UTC) and the nuqs testing adapter
 * holding the search params of `route`.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', locale = 'en', viewer, userOptions, ...options }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const queryClient = makeTestQueryClient();
  if (viewer !== undefined) {
    queryClient.setQueryData(queryKeys.viewer, viewer);
  }
  const urlUpdates: RenderWithProvidersResult['urlUpdates'] = [];
  const searchParams = new URL(route, 'http://localhost').searchParams;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TestIntlProvider locale={locale}>
          <NuqsTestingAdapter
            searchParams={searchParams}
            hasMemory
            onUrlUpdate={(event) => urlUpdates.push(event)}
          >
            {children}
          </NuqsTestingAdapter>
        </TestIntlProvider>
      </QueryClientProvider>
    );
  }

  return {
    user: userEvent.setup(userOptions),
    queryClient,
    urlUpdates,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
