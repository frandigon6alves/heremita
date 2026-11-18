import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import { loginRedirectFor } from '@/lib/routes';
import { isUnauthenticated } from './problem';
import { queryKeys } from './query-keys';

/** `fetch` rejects with a TypeError only when the request never got an HTTP answer. */
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Queries are retried at most once, and only when the network failed: an HTTP
 * error or a body that breaks the contract would fail the same way again.
 * `failureCount` is 0 on the first failure.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isNetworkError(error);
}

/** The page the browser is on, as the 401 handler needs it. */
export interface CurrentLocation {
  pathname: string;
  search: string;
}

/**
 * Login URL for a client call that failed with 401 `unauthenticated` (the
 * session expired or was revoked); `null` when nothing should happen: the
 * viewer query reports "signed out" through 401 by design, and public pages
 * stay where they are.
 */
export function unauthenticatedRedirect(
  error: unknown,
  location: CurrentLocation,
  queryKey?: QueryKey,
): string | null {
  if (!isUnauthenticated(error) || queryKey?.[0] === queryKeys.viewer[0]) {
    return null;
  }
  return loginRedirectFor(location.pathname, location.search);
}

/** How the browser client reads the current page and leaves it. */
export interface Navigation {
  location: () => CurrentLocation;
  redirect: (url: string) => void;
}

/** `navigation` is omitted on the server, where no client query runs. */
export function makeQueryClient(navigation?: Navigation): QueryClient {
  const handleError = (error: unknown, queryKey?: QueryKey) => {
    if (navigation === undefined) {
      return;
    }
    const target = unauthenticatedRedirect(error, navigation.location(), queryKey);
    if (target !== null) {
      navigation.redirect(target);
    }
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handleError(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => handleError(error) }),
    defaultOptions: {
      // Above zero so that data rendered a moment ago is not refetched at once.
      queries: { staleTime: 30_000, retry: shouldRetryQuery },
      // A retried mutation could apply twice.
      mutations: { retry: false },
    },
  });
}
