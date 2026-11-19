import type { EndpointName, EndpointOutput, Endpoints } from '@heremita/shared';
import type { ApiRoute } from '@heremita/shared/api-routes';
import { errorFromResponse } from './problem';
import { endpointPath, type RequestArgs, type UntypedOptions } from './request';

/**
 * Calls the API from the browser through the same-origin `/api/v1` rewrite
 * (the session cookie goes along by itself).
 *
 * Non-2xx → throws `ApiProblemError` (problem document parsed with the shared
 * schema) or `HttpError`; no answer at all → the `TypeError` of `fetch`.
 * Success bodies are trusted as `EndpointOutput`, not parsed (L3). Takes the
 * schema-free route (`apiRoutes.x`) so the browser never loads the schemas.
 */
export async function apiFetch<const N extends EndpointName>(
  route: ApiRoute<N>,
  ...[options]: RequestArgs<Endpoints[N]>
): Promise<EndpointOutput<Endpoints[N]>> {
  const { params, query, body, signal }: UntypedOptions = options ?? {};
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpointPath(route, { params, query }), {
    method: route.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  if (response.status === 204) {
    return undefined as EndpointOutput<Endpoints[N]>;
  }
  return (await response.json()) as EndpointOutput<Endpoints[N]>;
}
