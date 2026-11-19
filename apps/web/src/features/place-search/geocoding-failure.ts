import { hasCode, isNetworkError, problemCodeOf, requestIdOf } from '@/lib/api/failure';

/** Why a search or reverse lookup failed, as the inline message explains it. */
export type GeocodingFailure =
  | { kind: 'busy' }
  | { kind: 'unavailable' }
  | { kind: 'offline' }
  | { kind: 'unexpected'; code: string | undefined; requestId: string | undefined };

/** Classifies an error thrown by an E42/E43 query. */
export function geocodingFailure(error: unknown): GeocodingFailure {
  if (isNetworkError(error)) {
    return { kind: 'offline' };
  }
  if (hasCode(error, 'geocoding_busy')) {
    return { kind: 'busy' };
  }
  if (hasCode(error, 'geocoding_unavailable')) {
    return { kind: 'unavailable' };
  }
  return {
    kind: 'unexpected',
    code: problemCodeOf(error) ?? undefined,
    requestId: requestIdOf(error) ?? undefined,
  };
}
