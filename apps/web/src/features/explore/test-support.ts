import type { Page, PublicTripCard } from '@heremita/shared';

let seq = 0;

/** A public trip as E48 and E16 list it. */
export function buildPublicTripCard(overrides: Partial<PublicTripCard> = {}): PublicTripCard {
  seq += 1;
  return {
    id: `0195f0c8-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    title: 'Lisboa a pé',
    destinationName: 'Lisboa',
    countryCode: 'PT',
    dayCount: 4,
    placeCount: 18,
    defaultMode: 'walk',
    copyCount: 12,
    author: { id: '0195f0c8-0000-7000-8000-00000000c001', displayName: 'Ana', isDemo: true },
    previewPoints: [
      { lng: -9.1365, lat: 38.7077 },
      { lng: -9.1335, lat: 38.7139 },
      { lng: -9.2065, lat: 38.6979 },
    ],
    publishedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

export function page<T>(items: T[], nextCursor: string | null = null): Page<T> {
  return { items, nextCursor };
}
