import type { Destination, TripOwner, TripPublic } from '@heremita/shared';
import { USER_CARD_SELECT } from '../core/user-card.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Prisma `select` of everything a trip payload (owner or viewer shape) is built from. */
export const TRIP_SELECT = {
  id: true,
  title: true,
  description: true,
  destinationName: true,
  destinationCountryCode: true,
  destinationLng: true,
  destinationLat: true,
  startDate: true,
  visibility: true,
  shareToken: true,
  defaultMode: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: USER_CARD_SELECT },
  copiedFrom: { select: { id: true, title: true, visibility: true, moderationHiddenAt: true } },
  _count: { select: { days: true, tripPlaces: true, copies: true } },
} as const satisfies Prisma.TripSelect;

export type TripRow = Prisma.TripGetPayload<{ select: typeof TRIP_SELECT }>;

type DestinationColumns = Pick<
  TripRow,
  'destinationName' | 'destinationCountryCode' | 'destinationLng' | 'destinationLat'
>;

export function toDestination(row: DestinationColumns): Destination | null {
  if (row.destinationName === null) {
    return null;
  }
  const center =
    row.destinationLng === null || row.destinationLat === null
      ? null
      : { lng: row.destinationLng, lat: row.destinationLat };
  return { name: row.destinationName, countryCode: row.destinationCountryCode, center };
}

/** `YYYY-MM-DD` of a `DATE` column (Prisma reads it as UTC midnight). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC midnight of a `YYYY-MM-DD` date, as Prisma writes a `DATE` column. */
export function fromIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The source of a copy, shown only while that source is public and not hidden. */
function toCopiedFrom(source: TripRow['copiedFrom']): TripOwner['copiedFrom'] {
  if (source?.visibility !== 'public' || source.moderationHiddenAt !== null) {
    return null;
  }
  return { id: source.id, title: source.title };
}

export function toTripOwner(row: TripRow): TripOwner {
  return {
    viewerRole: 'owner',
    id: row.id,
    title: row.title,
    description: row.description,
    destination: toDestination(row),
    startDate: row.startDate && toIsoDate(row.startDate),
    dayCount: row._count.days,
    placeCount: row._count.tripPlaces,
    defaultMode: row.defaultMode,
    visibility: row.visibility,
    shareToken: row.shareToken,
    author: row.owner,
    copiedFrom: toCopiedFrom(row.copiedFrom),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The viewer shape of a `link` or `public` trip: no start date, no share
 * token, no timestamps but the publication. Callers decided access already.
 */
export function toTripPublic(row: TripRow): TripPublic {
  if (row.visibility === 'private') {
    throw new Error(`Trip ${row.id} is private and has no viewer shape`);
  }
  return {
    viewerRole: 'viewer',
    id: row.id,
    title: row.title,
    description: row.description,
    destination: toDestination(row),
    dayCount: row._count.days,
    placeCount: row._count.tripPlaces,
    defaultMode: row.defaultMode,
    visibility: row.visibility,
    author: row.owner,
    copiedFrom: toCopiedFrom(row.copiedFrom),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    copyCount: row._count.copies,
  };
}
