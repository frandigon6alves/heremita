import { API_PREFIX, type EndpointDef, type EndpointRequest } from '@heremita/shared';

type Request<E extends EndpointDef> = EndpointRequest<E>;

/** Parts whose every field is optional may be left out (`listMyTrips()` needs no `query`). */
type OptionalParts<E extends EndpointDef> = {
  [K in keyof Request<E> as object extends Request<E>[K] ? K : never]?: Request<E>[K];
};
type RequiredParts<E extends EndpointDef> = {
  [K in keyof Request<E> as object extends Request<E>[K] ? never : K]: Request<E>[K];
};

/** `params`, `query` and `body` exactly as the endpoint's schemas accept them, plus an abort signal. */
export type RequestOptions<E extends EndpointDef> = OptionalParts<E> &
  RequiredParts<E> & { signal?: AbortSignal };

/** The options argument may be omitted when the endpoint needs no input. */
export type RequestArgs<E extends EndpointDef> =
  object extends RequestOptions<E> ? [options?: RequestOptions<E>] : [options: RequestOptions<E>];

/** What the generic fetch code reads from `RequestOptions<E>`. */
export interface UntypedOptions {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  signal?: AbortSignal;
}

type QueryValue = string | number | boolean | null | undefined;

interface UrlParts {
  params?: unknown;
  query?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isQueryValue(value: unknown): value is QueryValue {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

/**
 * `/api/v1` path of an endpoint call: `{name}` segments filled (encoded) from
 * `params`; `undefined`/`null` query values left out.
 */
export function endpointPath(def: Pick<EndpointDef, 'path'>, { params, query }: UrlParts): string {
  const values = isRecord(params) ? params : {};
  const path = def.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (typeof value !== 'string' || value === '') {
      throw new TypeError(`Missing path parameter "${name}" for ${def.path}`);
    }
    return encodeURIComponent(value);
  });

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(isRecord(query) ? query : {})) {
    if (!isQueryValue(value)) {
      throw new TypeError(`Query parameter "${key}" of ${def.path} is not a scalar`);
    }
    if (value != null) {
      search.set(key, String(value));
    }
  }
  const queryString = search.toString();
  return `${API_PREFIX}${path}${queryString === '' ? '' : `?${queryString}`}`;
}
