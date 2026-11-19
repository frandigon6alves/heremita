import type { Page, RatingSummary, Review } from '@heremita/shared';
import { afterEach, beforeEach } from 'vitest';

export const PLACE_ID = '0195f0c8-0000-7000-8000-00000000a001';

let reviewSeq = 0;

/** A published review by someone else, as E45 returns it. */
export function buildReview(overrides: Partial<Review> = {}): Review {
  reviewSeq += 1;
  const suffix = String(reviewSeq).padStart(4, '0');
  return {
    id: `0195f0c8-0000-7000-8000-00000000${suffix}`,
    place: { id: PLACE_ID, name: 'Castelo de São Jorge', category: 'sight' },
    rating: 4,
    body: 'Vista linda sobre a cidade, vale a subida.',
    visitedMonth: '2026-10',
    language: 'pt-BR',
    author: { id: `0195f0c8-0000-7000-8000-0000000b${suffix}`, displayName: 'Bia', isDemo: false },
    status: 'published',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    isMine: false,
    ...overrides,
  };
}

export function page(items: Review[], nextCursor: string | null = null): Page<Review> {
  return { items, nextCursor };
}

export function buildRating(count: number): RatingSummary {
  return count >= 6
    ? { count, average: 4.4, distribution: [0, 1, 1, 2, count - 4] }
    : { count, average: null, distribution: null };
}

/** jsdom has no Popover API: the browser shows and hides popovers; tests only need the calls to exist. */
export function stubPopoverApi(): void {
  beforeEach(() => {
    HTMLElement.prototype.hidePopover = () => undefined;
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  });
}
