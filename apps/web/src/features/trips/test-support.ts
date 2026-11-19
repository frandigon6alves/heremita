import type { MyTripCard, Page, TripOwner } from '@heremita/shared';

export const TRIP_ID = '0195f0c8-0000-7000-8000-0000000a0001';
export const SHARE_TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';

let seq = 0;

function nextId(prefix: string): string {
  seq += 1;
  return `0195f0c8-0000-7000-8000-${prefix}${String(seq).padStart(12 - prefix.length, '0')}`;
}

/** A trip as its owner reads it (E19–E21, E25). */
export function buildTripOwner(overrides: Partial<TripOwner> = {}): TripOwner {
  return {
    viewerRole: 'owner',
    id: TRIP_ID,
    title: 'Lisboa em março',
    description: null,
    destination: null,
    startDate: null,
    dayCount: 3,
    placeCount: 0,
    defaultMode: 'walk',
    visibility: 'private',
    shareToken: null,
    author: { id: '0195f0c8-0000-7000-8000-000000000001', displayName: 'Ana', isDemo: false },
    copiedFrom: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}

/** One of my trips as E18 lists it. */
export function buildMyTripCard(overrides: Partial<MyTripCard> = {}): MyTripCard {
  return {
    id: nextId('a'),
    title: 'Lisboa em março',
    destinationName: 'Lisboa',
    startDate: null,
    dayCount: 4,
    placeCount: 23,
    visibility: 'private',
    updatedAt: '2026-11-18T10:00:00.000Z',
    previewPoints: [],
    ...overrides,
  };
}

export function page<T>(items: T[], nextCursor: string | null = null): Page<T> {
  return { items, nextCursor };
}
