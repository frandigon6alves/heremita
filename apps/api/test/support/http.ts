import {
  API_PREFIX,
  endpoints,
  type EndpointDef,
  type EndpointName,
  type EndpointOutput,
  type EndpointRequest,
} from '@heremita/shared';
import type request from 'supertest';

/** A supertest client: `request(server)`; `request.agent(server)` (cookie-keeping) has the same type. */
export type HttpClient = ReturnType<typeof request>;

/** Parts of a request as a client sends them; every part optional so tests can also send invalid ones. */
export interface RawRequest {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}

/** `def.path` with its `{name}` parameters filled in, under `API_PREFIX`. */
export function endpointUrl(def: EndpointDef, params: Record<string, string> = {}): string {
  const path = def.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${name}" for ${def.method} ${def.path}`);
    }
    return encodeURIComponent(value);
  });
  return `${API_PREFIX}${path}`;
}

/** Sends one endpoint request as is, whatever the answer. */
export function sendRaw(client: HttpClient, def: EndpointDef, raw: RawRequest = {}): request.Test {
  const url = endpointUrl(def, raw.params);
  const methods = {
    GET: () => client.get(url),
    POST: () => client.post(url),
    PUT: () => client.put(url),
    PATCH: () => client.patch(url),
    DELETE: () => client.delete(url),
  } satisfies Record<EndpointDef['method'], () => request.Test>;
  let call = methods[def.method]();
  if (raw.query) {
    call = call.query(raw.query as Record<string, string>);
  }
  if (raw.body !== undefined) {
    call = call.send(raw.body as object);
  }
  return call;
}

/** Thrown by `callOk` when the API does not answer the endpoint's success status. */
export class UnexpectedResponseError extends Error {
  override readonly name = 'UnexpectedResponseError';
}

/**
 * Calls an endpoint with a well-typed request and returns its success body;
 * any other status throws with the problem body, so fixture code fails loudly.
 */
export async function callOk<N extends EndpointName>(
  client: HttpClient,
  name: N,
  input: EndpointRequest<(typeof endpoints)[N]>,
): Promise<EndpointOutput<(typeof endpoints)[N]>> {
  const def: EndpointDef = endpoints[name];
  const response = await sendRaw(client, def, input);
  const accepted = [def.status, def.alternateStatus];
  if (!accepted.includes(response.status as EndpointDef['status'])) {
    throw new UnexpectedResponseError(
      `${name} answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return (response.status === 204 ? undefined : response.body) as EndpointOutput<
    (typeof endpoints)[N]
  >;
}
