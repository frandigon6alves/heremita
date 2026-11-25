// The Heremita REST API as the MCP server sees it: typed by the shared
// contract, signed in with the owner's own account when one is configured.
import {
  API_PREFIX,
  type EndpointName,
  type EndpointOutput,
  type EndpointRequest,
  type Endpoints,
} from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';

/** A problem document the API answered (RFC 9457), or a non-JSON failure. */
export class HeremitaApiError extends Error {
  override readonly name = 'HeremitaApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Credentials {
  email: string;
  password: string;
}

export interface HeremitaClientOptions {
  /** The site, e.g. `https://heremita.vercel.app`: the API answers under `/api/v1` there. */
  baseUrl: string;
  credentials?: Credentials | null;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

const SAFE = new Set(['GET', 'HEAD']);

type Input<N extends EndpointName> = EndpointRequest<Endpoints[N]>;

export class HeremitaClient {
  private readonly origin: string;
  private readonly fetcher: typeof fetch;
  private cookie: string | null = null;

  constructor(private readonly options: HeremitaClientOptions) {
    this.origin = new URL(options.baseUrl).origin;
    this.fetcher = options.fetch ?? fetch;
  }

  get signedIn(): boolean {
    return this.cookie !== null;
  }

  get canSignIn(): boolean {
    return Boolean(this.options.credentials);
  }

  /** Public web address of a trip, for links in tool answers. */
  tripUrl(tripId: string, locale = 'en'): string {
    return `${this.origin}/${locale}/t/${tripId}`;
  }

  async signIn(): Promise<void> {
    const credentials = this.options.credentials;
    if (!credentials) {
      throw new HeremitaApiError(401, 'unauthenticated', 'No Heremita account is configured.');
    }
    const response = await this.send('logIn', { body: credentials }, false);
    const cookies = response.headers.getSetCookie();
    const session = cookies.map((cookie) => cookie.split(';')[0]).find(Boolean);
    if (!session) {
      throw new HeremitaApiError(502, 'no_session', 'The API signed in but set no session cookie.');
    }
    this.cookie = session;
  }

  /**
   * Calls an endpoint and returns its typed body. Endpoints that need a
   * session sign in first, and once more when the session has expired.
   */
  async call<N extends EndpointName>(
    name: N,
    input: Input<N> = {} as Input<N>,
  ): Promise<EndpointOutput<Endpoints[N]>> {
    if (this.needsSession(name) && !this.signedIn) {
      await this.signIn();
    }
    let response = await this.send(name, input, true);
    if (response.status === 401 && this.canSignIn) {
      this.cookie = null;
      await this.signIn();
      response = await this.send(name, input, true);
    }
    if (!response.ok) {
      throw await toApiError(response);
    }
    return (response.status === 204 ? undefined : await response.json()) as EndpointOutput<
      Endpoints[N]
    >;
  }

  private needsSession(name: EndpointName): boolean {
    // Optional-auth reads (public trips, places) also go signed in when an account is set,
    // so the owner's private trips and reviews read as theirs.
    return this.canSignIn && name !== 'logIn' && name !== 'getLiveness';
  }

  private async send<N extends EndpointName>(
    name: N,
    input: Input<N>,
    withSession: boolean,
  ): Promise<Response> {
    const route = apiRoutes[name];
    const { params, query, body } = input as {
      params?: Record<string, string>;
      query?: Record<string, unknown>;
      body?: unknown;
    };
    const path = route.path.replace(/\{(\w+)\}/g, (_match, key: string) => {
      const value = params?.[key];
      if (value === undefined) {
        throw new Error(`Missing path parameter ${key} for ${name}`);
      }
      return encodeURIComponent(value);
    });
    const url = new URL(`${API_PREFIX}${path}`, this.origin);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!SAFE.has(route.method)) {
      // The API refuses unsafe requests from any other origin (CSRF check).
      headers['Origin'] = this.origin;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (withSession && this.cookie) {
      headers['Cookie'] = this.cookie;
    }
    const response = await this.fetcher(url, {
      method: route.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!withSession && !response.ok) {
      throw await toApiError(response);
    }
    return response;
  }
}

async function toApiError(response: Response): Promise<HeremitaApiError> {
  const text = await response.text();
  try {
    const problem = JSON.parse(text) as { code?: string; detail?: string; title?: string };
    return new HeremitaApiError(
      response.status,
      problem.code ?? 'error',
      problem.detail ?? problem.title ?? `HTTP ${response.status}`,
    );
  } catch {
    return new HeremitaApiError(response.status, 'error', `HTTP ${response.status}`);
  }
}
