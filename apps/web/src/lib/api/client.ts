import type { EndpointDef, EndpointOutput } from '@heremita/shared';
import { errorFromResponse } from './problem';
import { endpointPath, type RequestArgs, type UntypedOptions } from './request';

/**
 * Calls the API from the browser through the same-origin `/api/v1` rewrite
 * (the session cookie goes along by itself).
 *
 * Non-2xx → throws `ApiProblemError` (problem document parsed with the shared
 * schema) or `HttpError`; no answer at all → the `TypeError` of `fetch`.
 * Success bodies are trusted as `EndpointOutput<E>`, not parsed (L3).
 */
export async function apiFetch<const E extends EndpointDef>(
  def: E,
  ...[options]: RequestArgs<E>
): Promise<EndpointOutput<E>> {
  const { params, query, body, signal }: UntypedOptions = options ?? {};
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpointPath(def, { params, query }), {
    method: def.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  if (response.status === 204) {
    return undefined as EndpointOutput<E>;
  }
  return (await response.json()) as EndpointOutput<E>;
}
