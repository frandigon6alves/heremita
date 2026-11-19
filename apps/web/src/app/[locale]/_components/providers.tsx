'use client';

import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { makeQueryClient, type Navigation } from '@/lib/api/query-client';
import { clearDrafts } from '@/shared/storage/session-drafts';

let browserQueryClient: QueryClient | undefined;

/**
 * A lost session leaves with a full page load: the login page starts from a
 * clean cache, and nothing of the previous viewer stays in memory or in drafts.
 */
const browserNavigation: Navigation = {
  location: () => ({ pathname: window.location.pathname, search: window.location.search }),
  redirect: (url) => {
    clearDrafts();
    window.location.assign(url);
  },
};

function getQueryClient(): QueryClient {
  // Server: one client per request, so nothing leaks between users.
  if (isServer) {
    return makeQueryClient();
  }
  // Browser: one client for the whole session. It is not kept in React state
  // because React discards state if the first render suspends.
  browserQueryClient ??= makeQueryClient(browserNavigation);
  return browserQueryClient;
}

/**
 * Client-side providers: the server-state cache. The nuqs adapter (URL
 * search-param state) wraps only the pages that use it: the planner, the
 * read-only trip pages and the place page.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
