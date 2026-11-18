import { hashPassword, verifyPassword } from '../../src/core/password/passwords.js';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import {
  GAZETTEER,
  GAZETTEER_KEYS,
  type GazetteerPlace,
} from '../../src/providers/fake/gazetteer.js';
import { seedId } from './ids.js';
import { SEED_REPORTS, SEED_REVIEWS } from './reviews.js';
import { SEED_TRIPS, seedShareToken, type GazetteerName, type SeedTrip } from './trips.js';
import { SEED_USERS, type SeedUserHandle } from './users.js';

type Tx = Prisma.TransactionClient;

const TRANSACTION_TIMEOUT_MS = 60_000;
/** Ids inside one trip: row = trip number * TRIP_ROW_BLOCK + index. */
const TRIP_ROW_BLOCK = 100;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const LOCALE_TO_DB = { 'pt-BR': 'pt_BR', en: 'en' } as const;

/** Writes the demo data. Upserts by fixed ids, so running it again changes nothing. */
export async function seedDemo(prisma: PrismaClient, demoPassword: string): Promise<void> {
  const passwordHash = await demoPasswordHash(prisma, demoPassword);
  await prisma.$transaction(
    async (tx) => {
      await upsertUsers(tx, passwordHash);
      const placeIds = await upsertPlaces(tx);
      for (const trip of SEED_TRIPS) {
        await upsertTrip(tx, trip, placeIds);
      }
      const reviewIds = await upsertReviews(tx, placeIds);
      await upsertReports(tx, reviewIds);
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

/** Keeps the stored hash while it still matches, so a second run leaves the rows identical. */
async function demoPasswordHash(prisma: PrismaClient, demoPassword: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: SEED_USERS.demo.id },
    select: { passwordHash: true },
  });
  if (existing && (await verifyPassword(existing.passwordHash, demoPassword))) {
    return existing.passwordHash;
  }
  return hashPassword(demoPassword);
}

async function upsertUsers(tx: Tx, passwordHash: string): Promise<void> {
  for (const user of Object.values(SEED_USERS)) {
    const data = {
      email: user.email,
      passwordHash,
      displayName: user.displayName,
      role: user.role,
      locale: LOCALE_TO_DB[user.locale],
      theme: 'system',
      isDemo: true,
      passwordChangedAt: user.createdAt,
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    } satisfies Prisma.UserUncheckedUpdateInput;
    await tx.user.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
  }
}

/** Canonical places are unique by OSM ref: one a user already added keeps its id. */
async function upsertPlaces(tx: Tx): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [index, place] of GAZETTEER.entries()) {
    const data = placeData(place);
    const row = await tx.place.upsert({
      where: { osmType_osmId: { osmType: place.ref.osmType, osmId: BigInt(place.ref.osmId) } },
      create: { id: seedId('place', index + 1), ...data },
      update: data,
      select: { id: true },
    });
    ids.set(place.key, row.id);
  }
  return ids;
}

function placeData(place: GazetteerPlace) {
  const local = place.localized['pt-BR'];
  const seededAt = new Date('2026-01-01T00:00:00.000Z');
  return {
    source: 'osm',
    osmType: place.ref.osmType,
    osmId: BigInt(place.ref.osmId),
    name: local.name,
    label: local.label || null,
    category: place.category,
    osmKey: place.osmKey,
    osmValue: place.osmValue,
    lng: place.location.lng,
    lat: place.location.lat,
    address: local.address,
    countryCode: place.countryCode,
    lastSeenAt: seededAt,
    createdAt: seededAt,
    updatedAt: seededAt,
  } satisfies Prisma.PlaceUncheckedUpdateInput;
}

function required<K>(ids: Map<K, string>, key: K): string {
  const id = ids.get(key);
  if (!id) {
    throw new Error(`Seed data refers to ${String(key)}, which is not seeded.`);
  }
  return id;
}

function placeIdOf(placeIds: Map<string, string>, name: GazetteerName): string {
  return required(placeIds, GAZETTEER_KEYS[name]);
}

async function upsertTrip(tx: Tx, trip: SeedTrip, placeIds: Map<string, string>): Promise<void> {
  const id = seedId('trip', trip.number);
  const updatedAt = new Date(trip.updatedAt);
  const data = {
    ownerId: SEED_USERS[trip.owner].id,
    title: trip.title,
    description: trip.description,
    destinationName: trip.destination?.name ?? null,
    destinationCountryCode: trip.destination?.countryCode ?? null,
    destinationLng: trip.destination?.center.lng ?? null,
    destinationLat: trip.destination?.center.lat ?? null,
    startDate: trip.startDate ? new Date(`${trip.startDate}T00:00:00.000Z`) : null,
    visibility: trip.visibility,
    shareToken: trip.visibility === 'private' ? null : seedShareToken(trip.number),
    defaultMode: trip.defaultMode,
    planVersion: 0,
    publishedAt: trip.visibility === 'public' ? updatedAt : null,
    moderationHiddenAt: null,
    copiedFromTripId: trip.copiedFrom === null ? null : seedId('trip', trip.copiedFrom),
    createdAt: new Date(trip.createdAt),
    updatedAt,
  } satisfies Prisma.TripUncheckedUpdateInput;
  await tx.trip.upsert({ where: { id }, create: { id, ...data }, update: data });

  const firstRow = trip.number * TRIP_ROW_BLOCK;
  const scheduled = trip.days.flatMap((day) => day.stops.map((stop) => stop.place));
  const tripPlaceNames = [...new Set([...scheduled, ...trip.ideas])];
  const tripPlaceIds = new Map<GazetteerName, string>();
  for (const [index, name] of tripPlaceNames.entries()) {
    const tripPlaceId = seedId('tripPlace', firstRow + index);
    tripPlaceIds.set(name, tripPlaceId);
    const tripPlace = {
      tripId: id,
      placeId: placeIdOf(placeIds, name),
      note: trip.notes[name] ?? null,
      createdAt: new Date(trip.createdAt),
      updatedAt,
    } satisfies Prisma.TripPlaceUncheckedUpdateInput;
    await tx.tripPlace.upsert({
      where: { id: tripPlaceId },
      create: { id: tripPlaceId, ...tripPlace },
      update: tripPlace,
    });
  }

  let stopRow = firstRow;
  for (const [position, day] of trip.days.entries()) {
    const dayId = seedId('day', firstRow + position);
    const dayData = {
      tripId: id,
      position,
      modeOverride: day.modeOverride ?? null,
      createdAt: new Date(trip.createdAt),
    } satisfies Prisma.DayUncheckedUpdateInput;
    await tx.day.upsert({
      where: { id: dayId },
      create: { id: dayId, ...dayData },
      update: dayData,
    });

    for (const [stopPosition, stop] of day.stops.entries()) {
      const stopId = seedId('stop', stopRow++);
      const stopData = {
        tripId: id,
        dayId,
        tripPlaceId: required(tripPlaceIds, stop.place),
        position: stopPosition,
        modeToNext: stop.modeToNext ?? null,
        createdAt: new Date(trip.createdAt),
      } satisfies Prisma.StopUncheckedUpdateInput;
      await tx.stop.upsert({
        where: { id: stopId },
        create: { id: stopId, ...stopData },
        update: stopData,
      });
    }
  }
}

function reviewKey(place: GazetteerName, author: SeedUserHandle): string {
  return `${place}/${author}`;
}

/** First day of the month after the visit, and never before the author signed up. */
function reviewCreatedAt(visitedMonth: string, author: SeedUserHandle, row: number): Date {
  const [year, month] = visitedMonth.split('-').map(Number) as [number, number];
  const afterVisit = Date.UTC(year, month, 1);
  const afterSignup = SEED_USERS[author].createdAt.getTime() + DAY_MS;
  return new Date(Math.max(afterVisit, afterSignup) + (row % 12) * HOUR_MS);
}

async function upsertReviews(tx: Tx, placeIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  let row = 1;
  for (const [name, reviews] of Object.entries(SEED_REVIEWS) as Array<
    [GazetteerName, NonNullable<(typeof SEED_REVIEWS)[GazetteerName]>]
  >) {
    for (const [author, rating, visitedMonth, body] of reviews) {
      const id = seedId('review', row);
      const createdAt = reviewCreatedAt(visitedMonth, author, row);
      row += 1;
      ids.set(reviewKey(name, author), id);
      const data = {
        placeId: placeIdOf(placeIds, name),
        authorId: SEED_USERS[author].id,
        rating,
        body,
        visitedOn: new Date(`${visitedMonth}-01T00:00:00.000Z`),
        language: LOCALE_TO_DB[SEED_USERS[author].locale],
        status: 'published',
        hiddenAt: null,
        createdAt,
        updatedAt: createdAt,
      } satisfies Prisma.ReviewUncheckedUpdateInput;
      await tx.review.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
  }
  return ids;
}

async function upsertReports(tx: Tx, reviewIds: Map<string, string>): Promise<void> {
  for (const report of SEED_REPORTS) {
    const id = seedId('report', report.number);
    const reviewId = required(reviewIds, reviewKey(report.review.place, report.review.author));
    const data = {
      reporterId: SEED_USERS[report.reporter].id,
      targetType: 'review',
      reviewId,
      tripId: null,
      reason: report.reason,
      details: report.details,
      status: report.resolution ? 'dismissed' : 'open',
      resolvedById: report.resolution ? SEED_USERS[report.resolution.by].id : null,
      resolvedAt: report.resolution ? new Date(report.resolution.at) : null,
      createdAt: new Date(report.createdAt),
    } satisfies Prisma.ReportUncheckedUpdateInput;
    await tx.report.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}
