import type { Locale } from '@heremita/shared';
import type { Request } from 'express';

/** The signed-in caller, set on the request by the session guard. */
export interface SessionUser {
  id: string;
  role: 'user' | 'moderator';
  locale: Locale;
  sessionId: string;
}

/** Request parts after the endpoint's schemas parsed them (defaults applied, text cleaned). */
export interface ContractInput {
  params?: unknown;
  query?: unknown;
  body?: unknown;
}

/** The Express request as the API's guards, interceptors and decorators see it. */
export interface ApiRequest extends Request {
  user?: SessionUser;
  contract?: ContractInput;
}
