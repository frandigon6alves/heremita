import { ApiProblemError, HttpError } from '@/lib/api/problem';

/** Why a search or reverse lookup failed, as the inline message explains it. */
export type GeocodingFailure =
  | { kind: 'busy' }
  | { kind: 'unavailable' }
  | { kind: 'offline' }
  | { kind: 'unexpected'; code: string | undefined; requestId: string | undefined };

/** Classifies an error thrown by an E42/E43 query. */
export function geocodingFailure(error: unknown): GeocodingFailure {
  if (error instanceof TypeError) {
    return { kind: 'offline' };
  }
  if (error instanceof ApiProblemError) {
    if (error.code === 'geocoding_busy') {
      return { kind: 'busy' };
    }
    if (error.code === 'geocoding_unavailable') {
      return { kind: 'unavailable' };
    }
    return { kind: 'unexpected', code: error.code, requestId: error.requestId ?? undefined };
  }
  if (error instanceof HttpError) {
    return { kind: 'unexpected', code: undefined, requestId: error.requestId ?? undefined };
  }
  return { kind: 'unexpected', code: undefined, requestId: undefined };
}
