import type { TestApp } from '../support/app.js';

/**
 * Content rows written straight to the database, so account and profile tests
 * do not depend on the trip and review endpoints of other workstreams.
 */

let osmIds = 9_000_000_000;

/** A canonical OSM place no gazetteer row collides with. */
export async function insertPlace(t: TestApp, name = 'Miradouro'): Promise<string> {
  osmIds += 1;
  const place = await t.prisma.place.create({
    data: {
      source: 'osm',
      osmType: 'N',
      osmId: BigInt(osmIds),
      name,
      category: 'sight',
      lng: -9.13 + (osmIds % 100) / 1000,
      lat: 38.71,
      countryCode: 'PT',
    },
    select: { id: true },
  });
  return place.id;
}

export interface TripRows {
  visibility?: 'private' | 'link' | 'public';
  publishedAt?: Date;
  hiddenAt?: Date;
  title?: string;
  /** Places scheduled on day 1, in visit order. */
  stops?: string[];
  /** Places on day 2, after day 1's. */
  secondDayStops?: string[];
  /** Places in the trip on no day. */
  ideas?: string[];
  copiedFromTripId?: string;
  /** Adds a custom pin (place row owned by the trip) as an idea. */
  customPlace?: boolean;
}

let shareTokens = 0;

/** A trip with its days, trip places and stops. `public` needs `publishedAt` (CHECK). */
export async function insertTrip(
  t: TestApp,
  ownerId: string,
  rows: TripRows = {},
): Promise<string> {
  const visibility = rows.visibility ?? 'private';
  shareTokens += 1;
  const trip = await t.prisma.trip.create({
    data: {
      ownerId,
      title: rows.title ?? 'Lisboa em três dias',
      destinationName: 'Lisboa',
      destinationCountryCode: 'PT',
      visibility,
      shareToken:
        visibility === 'private' ? null : `token-${String(shareTokens).padStart(16, '0')}`,
      publishedAt: visibility === 'public' ? (rows.publishedAt ?? t.clock.now()) : null,
      moderationHiddenAt: rows.hiddenAt ?? null,
      copiedFromTripId: rows.copiedFromTripId ?? null,
    },
    select: { id: true },
  });
  const days = [rows.stops ?? [], rows.secondDayStops ?? []];
  for (const [position, placeIds] of days.entries()) {
    const day = await t.prisma.day.create({
      data: { tripId: trip.id, position },
      select: { id: true },
    });
    for (const [index, placeId] of placeIds.entries()) {
      const tripPlace = await t.prisma.tripPlace.create({
        data: { tripId: trip.id, placeId },
        select: { id: true },
      });
      await t.prisma.stop.create({
        data: { tripId: trip.id, dayId: day.id, tripPlaceId: tripPlace.id, position: index },
      });
    }
  }
  for (const placeId of rows.ideas ?? []) {
    await t.prisma.tripPlace.create({ data: { tripId: trip.id, placeId } });
  }
  if (rows.customPlace) {
    const custom = await t.prisma.place.create({
      data: {
        source: 'custom',
        tripId: trip.id,
        name: 'Casa',
        category: 'lodging',
        lng: 0,
        lat: 0,
      },
      select: { id: true },
    });
    await t.prisma.tripPlace.create({
      data: { tripId: trip.id, placeId: custom.id, note: 'Chave com a vizinha' },
    });
  }
  return trip.id;
}

export interface ReviewRows {
  rating?: number;
  createdAt?: Date;
  hidden?: boolean;
}

export async function insertReview(
  t: TestApp,
  authorId: string,
  placeId: string,
  rows: ReviewRows = {},
): Promise<string> {
  const createdAt = rows.createdAt ?? t.clock.now();
  const review = await t.prisma.review.create({
    data: {
      authorId,
      placeId,
      rating: rows.rating ?? 4,
      body: 'Vista linda ao fim da tarde.',
      visitedOn: new Date('2026-09-01T00:00:00.000Z'),
      language: 'pt_BR',
      status: rows.hidden ? 'hidden' : 'published',
      hiddenAt: rows.hidden ? createdAt : null,
      createdAt,
    },
    select: { id: true },
  });
  return review.id;
}

export async function insertBlock(t: TestApp, blockerId: string, blockedId: string): Promise<void> {
  await t.prisma.userBlock.create({ data: { blockerId, blockedId } });
}
