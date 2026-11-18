import type { Locale } from '@heremita/shared';
import { isSafeNextPath, routes } from '@/lib/routes';

/**
 * Where a signed-out request for a members-only page goes: log-in, coming
 * back to the requested page when its path is a safe `next`.
 */
export function signedOutRedirect(locale: Locale, requestedPath: string | null): string {
  return routes.login(locale, isSafeNextPath(requestedPath) ? { next: requestedPath } : {});
}
