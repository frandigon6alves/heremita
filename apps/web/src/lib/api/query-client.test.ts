import type { ProblemDetails } from '@heremita/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiProblemError, HttpError } from './problem';
import {
  makeQueryClient,
  shouldRetryQuery,
  unauthenticatedRedirect,
  type CurrentLocation,
} from './query-client';
import { queryKeys } from './query-keys';

function problemError(status: number, code: string): ApiProblemError {
  const problem: ProblemDetails = {
    type: `urn:heremita:problem:${code}`,
    title: code,
    status,
    detail: code,
    instance: '/api/v1/x',
    code,
  };
  return new ApiProblemError(problem);
}

const unauthenticated = problemError(401, 'unauthenticated');
const planner: CurrentLocation = { pathname: '/pt-BR/trips/t1', search: '?day=ideas' };

describe('shouldRetryQuery', () => {
  it('retries_once_after_a_network_error', () => {
    const networkError = new TypeError('fetch failed');

    expect(shouldRetryQuery(0, networkError)).toBe(true);
    expect(shouldRetryQuery(1, networkError)).toBe(false);
  });

  it('never_retries_an_http_error', () => {
    expect(shouldRetryQuery(0, problemError(503, 'database_unavailable'))).toBe(false);
    expect(shouldRetryQuery(0, new HttpError(502))).toBe(false);
  });
});

describe('unauthenticatedRedirect', () => {
  it('sends_a_lost_session_to_login_with_next_set_to_the_current_page', () => {
    expect(unauthenticatedRedirect(unauthenticated, planner, ['trips', 't1', 'plan'])).toBe(
      '/pt-BR/login?next=%2Fpt-BR%2Ftrips%2Ft1%3Fday%3Dideas',
    );
  });

  it('logs_in_in_the_language_of_the_page', () => {
    expect(unauthenticatedRedirect(unauthenticated, { pathname: '/en/settings', search: '' })).toBe(
      '/en/login?next=%2Fen%2Fsettings',
    );
  });

  it('ignores_the_viewer_query', () => {
    expect(unauthenticatedRedirect(unauthenticated, planner, queryKeys.viewer)).toBeNull();
  });

  it.each([
    '/pt-BR',
    '/en/explore',
    '/en/t/t1',
    '/pt-BR/s/tok',
    '/en/places/p1',
    '/en/u/u1',
    '/en/login',
  ])('stays_on_public_page_%s', (pathname) => {
    expect(unauthenticatedRedirect(unauthenticated, { pathname, search: '' })).toBeNull();
  });

  it('ignores_wrong_credentials_and_other_errors', () => {
    expect(unauthenticatedRedirect(problemError(401, 'invalid_credentials'), planner)).toBeNull();
    expect(unauthenticatedRedirect(problemError(404, 'trip_not_found'), planner)).toBeNull();
    expect(unauthenticatedRedirect(new HttpError(401), planner)).toBeNull();
    expect(unauthenticatedRedirect(new TypeError('fetch failed'), planner)).toBeNull();
  });
});

describe('makeQueryClient', () => {
  function clientWithNavigation(location: CurrentLocation = planner) {
    const redirect = vi.fn<(url: string) => void>();
    return { client: makeQueryClient({ location: () => location, redirect }), redirect };
  }

  it('redirects_when_a_query_fails_with_401', async () => {
    const { client, redirect } = clientWithNavigation();

    await client
      .fetchQuery({
        queryKey: ['trips', 't1', 'plan'],
        queryFn: () => Promise.reject(unauthenticated),
      })
      .catch(() => undefined);

    expect(redirect).toHaveBeenCalledWith('/pt-BR/login?next=%2Fpt-BR%2Ftrips%2Ft1%3Fday%3Dideas');
  });

  it('redirects_when_a_mutation_fails_with_401', async () => {
    const { client, redirect } = clientWithNavigation();
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(unauthenticated),
    });

    await mutation.execute(undefined).catch(() => undefined);

    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('does_not_redirect_for_the_viewer_query', async () => {
    const { client, redirect } = clientWithNavigation();

    await client
      .fetchQuery({ queryKey: queryKeys.viewer, queryFn: () => Promise.reject(unauthenticated) })
      .catch(() => undefined);

    expect(redirect).not.toHaveBeenCalled();
  });

  it('never_retries_a_mutation', async () => {
    const client = makeQueryClient();
    const mutationFn = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const mutation = client.getMutationCache().build(client, { mutationFn });

    await mutation.execute(undefined).catch(() => undefined);

    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});
