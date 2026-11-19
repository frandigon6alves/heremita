import type { EndpointName } from '@heremita/shared';

/**
 * Endpoints whose handlers are not written yet: the route-table test skips them
 * and their authorisation-matrix rows are `todo`. A task that implements an
 * endpoint removes it here. Empty at release (T71).
 */
export const PENDING_ENDPOINTS: readonly EndpointName[] = [];
