import { Inject, Injectable } from '@nestjs/common';
import {
  LIMITS,
  type EndpointInput,
  type endpoints,
  type MyTripCard,
  type Page,
  type ShareTokenResponse,
  type Trip,
  type TripOwner,
} from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { CURSOR_TUPLES, decodeCursor, toPage } from '../core/cursor.js';
import { ApiProblem } from '../core/http/api-problem.js';
import { tripNotFound } from '../core/http/problems.js';
import type { SessionUser } from '../core/http/api-request.js';
import { TripAccessService } from '../core/trip-access.service.js';
import type { TripRef } from '../core/trip-access.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { copyTitle } from './copy-title.js';
import { PreviewPointsReader } from './preview-points.reader.js';
import { newShareToken } from './share-token.js';
import {
  fromIsoDate,
  toIsoDate,
  toTripOwner,
  toTripPublic,
  TRIP_SELECT,
  type TripRow,
} from './trip.mapper.js';

type ListMyTripsQuery = EndpointInput<typeof endpoints.listMyTrips>['query'];
type CreateTripBody = EndpointInput<typeof endpoints.createTrip>['body'];
type UpdateTripBody = EndpointInput<typeof endpoints.updateTrip>['body'];
type CopyTripBody = EndpointInput<typeof endpoints.copyTrip>['body'];
type DestinationBody = CreateTripBody['destination'];

const MY_TRIP_CARD_SELECT = {
  id: true,
  title: true,
  destinationName: true,
  startDate: true,
  visibility: true,
  updatedAt: true,
  _count: { select: { days: true, tripPlaces: true } },
} as const satisfies Prisma.TripSelect;

function destinationColumns(destination: DestinationBody) {
  return {
    destinationName: destination?.name ?? null,
    destinationCountryCode: destination?.countryCode ?? null,
    destinationLng: destination?.center?.lng ?? null,
    destinationLat: destination?.center?.lat ?? null,
  };
}

/**
 * Holds the user's row until the transaction ends, so concurrent creates and
 * copies count the user's trips one after another, then refuses the 101st trip.
 */
async function reserveTripSlot(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  const count = await tx.trip.count({ where: { ownerId: userId } });
  if (count >= LIMITS.TRIPS_PER_USER) {
    throw new ApiProblem(
      'limit_reached',
      `An account holds at most ${LIMITS.TRIPS_PER_USER} trips.`,
    );
  }
}

/** The caller's trips and the trip resource itself (E18–E23, E25, E28). */
@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly previews: PreviewPointsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** E18: most recently edited first. */
  async listMine(userId: string, query: ListMyTripsQuery): Promise<Page<MyTripCard>> {
    const after = decodeCursor(CURSOR_TUPLES.myTrips, query.cursor);
    const rows = await this.prisma.trip.findMany({
      where: {
        ownerId: userId,
        ...(after && {
          OR: [{ updatedAt: { lt: after[0] } }, { updatedAt: after[0], id: { lt: after[1] } }],
        }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: MY_TRIP_CARD_SELECT,
    });
    const page = toPage(rows, query.limit, CURSOR_TUPLES.myTrips, (row) => [row.updatedAt, row.id]);
    const points = await this.previews.read(page.items.map((row) => row.id));
    return {
      items: page.items.map((row) => ({
        id: row.id,
        title: row.title,
        destinationName: row.destinationName,
        startDate: row.startDate && toIsoDate(row.startDate),
        dayCount: row._count.days,
        placeCount: row._count.tripPlaces,
        visibility: row.visibility,
        updatedAt: row.updatedAt.toISOString(),
        previewPoints: points.get(row.id) ?? [],
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** E19: a private trip with `dayCount` empty days. */
  async create(userId: string, body: CreateTripBody): Promise<TripOwner> {
    const now = this.clock.now();
    const row = await this.prisma.$transaction(async (tx) => {
      await reserveTripSlot(tx, userId);
      return tx.trip.create({
        data: {
          ownerId: userId,
          title: body.title,
          ...destinationColumns(body.destination),
          startDate: body.startDate === null ? null : fromIsoDate(body.startDate),
          defaultMode: body.defaultMode,
          createdAt: now,
          updatedAt: now,
          days: {
            createMany: {
              data: Array.from({ length: body.dayCount }, (_, position) => ({
                position,
                createdAt: now,
              })),
            },
          },
        },
        select: TRIP_SELECT,
      });
    });
    return toTripOwner(row);
  }

  /** E20: the owner shape for the owner, the viewer shape for anyone else who may read it. */
  async get(tripId: string, viewer: SessionUser | null): Promise<Trip> {
    const access = await this.access.require({ tripId }, viewer);
    const row = await this.read(access.tripId);
    return access.role === 'owner' ? toTripOwner(row) : toTripPublic(row);
  }

  /**
   * E21 in one statement, so the visibility rules hold under concurrent edits:
   * leaving `private` keeps or creates the share token, becoming `public` stamps
   * `published_at` (kept while it stays public), leaving `public` clears it, and
   * a different `defaultMode` moves the plan version on.
   */
  async update(userId: string, tripId: string, body: UpdateTripBody): Promise<TripOwner> {
    const now = this.clock.now();
    const sets: Prisma.Sql[] = [Prisma.sql`updated_at = ${now}`];
    if (body.title !== undefined) {
      sets.push(Prisma.sql`title = ${body.title}`);
    }
    if (body.description !== undefined) {
      sets.push(Prisma.sql`description = ${body.description}`);
    }
    if (body.destination !== undefined) {
      const columns = destinationColumns(body.destination);
      sets.push(
        Prisma.sql`destination_name = ${columns.destinationName}`,
        Prisma.sql`destination_country_code = ${columns.destinationCountryCode}`,
        Prisma.sql`destination_lng = ${columns.destinationLng}::float8`,
        Prisma.sql`destination_lat = ${columns.destinationLat}::float8`,
      );
    }
    if (body.startDate !== undefined) {
      sets.push(Prisma.sql`start_date = ${body.startDate}::date`);
    }
    if (body.defaultMode !== undefined) {
      const mode = Prisma.sql`${body.defaultMode}::"TravelMode"`;
      sets.push(
        Prisma.sql`plan_version = plan_version + CASE WHEN default_mode = ${mode} THEN 0 ELSE 1 END`,
        Prisma.sql`default_mode = ${mode}`,
      );
    }
    if (body.visibility !== undefined) {
      sets.push(Prisma.sql`visibility = ${body.visibility}::"TripVisibility"`);
      if (body.visibility !== 'private') {
        sets.push(Prisma.sql`share_token = COALESCE(share_token, ${newShareToken()})`);
      }
      sets.push(
        body.visibility === 'public'
          ? Prisma.sql`published_at = CASE WHEN visibility = 'public' THEN published_at ELSE ${now} END`
          : Prisma.sql`published_at = NULL`,
      );
    }
    const updated = await this.prisma.$executeRaw`
      UPDATE trips SET ${Prisma.join(sets)}
      WHERE id = ${tripId}::uuid AND owner_id = ${userId}::uuid`;
    if (updated === 0) {
      throw tripNotFound();
    }
    return toTripOwner(await this.read(tripId));
  }

  /** E22: days, stops, trip places and custom places go with the trip (FK cascades). */
  async delete(userId: string, tripId: string): Promise<void> {
    const { count } = await this.prisma.trip.deleteMany({ where: { id: tripId, ownerId: userId } });
    if (count === 0) {
      throw tripNotFound();
    }
  }

  /** E23: the old token stops opening the trip as soon as this commits. */
  async rotateShareToken(userId: string, tripId: string): Promise<ShareTokenResponse> {
    const shareToken = newShareToken();
    const { count } = await this.prisma.trip.updateMany({
      where: { id: tripId, ownerId: userId, visibility: { not: 'private' } },
      data: { shareToken },
    });
    if (count > 0) {
      return { shareToken };
    }
    const exists = await this.prisma.trip.count({ where: { id: tripId, ownerId: userId } });
    if (exists === 0) {
      throw tripNotFound();
    }
    throw new ApiProblem('trip_is_private', 'A private trip has no share link to rotate.');
  }

  /**
   * E25 (`{tripId}`: own trip or public one) and E28 (`{shareToken}`). The copy
   * is private, undated and unshared; it keeps days, stops, order and modes,
   * clones custom places, and leaves notes behind.
   */
  async copy(user: SessionUser, ref: TripRef, body: CopyTripBody): Promise<TripOwner> {
    const source = await this.access.require(ref, user);
    const now = this.clock.now();
    const copyId = await this.prisma.$transaction(async (tx) => {
      await reserveTripSlot(tx, user.id);
      const [locked] = await tx.$queryRaw<{ title: string }[]>`
        SELECT title FROM trips WHERE id = ${source.tripId}::uuid FOR SHARE`;
      if (!locked) {
        throw tripNotFound();
      }
      const title = body.title ?? copyTitle(locked.title, user.locale);
      const [copy] = await tx.$queryRaw<{ id: string }[]>`
        WITH new_trip AS (
          INSERT INTO trips (owner_id, title, description, destination_name,
            destination_country_code, destination_lng, destination_lat, visibility,
            default_mode, copied_from_trip_id, created_at, updated_at)
          SELECT ${user.id}::uuid, ${title}, t.description, t.destination_name,
            t.destination_country_code, t.destination_lng, t.destination_lat, 'private',
            t.default_mode, t.id, ${now}, ${now}
          FROM trips t WHERE t.id = ${source.tripId}::uuid
          RETURNING id
        ),
        place_map AS MATERIALIZED (
          SELECT p.id AS old_id, uuidv7() AS new_id
          FROM places p WHERE p.trip_id = ${source.tripId}::uuid
        ),
        new_places AS (
          INSERT INTO places (id, source, trip_id, name, label, category, osm_key, osm_value,
            lng, lat, address, country_code, created_at, updated_at)
          SELECT m.new_id, p.source, (SELECT id FROM new_trip), p.name, p.label, p.category,
            p.osm_key, p.osm_value, p.lng, p.lat, p.address, p.country_code, ${now}, ${now}
          FROM place_map m JOIN places p ON p.id = m.old_id
        ),
        trip_place_map AS MATERIALIZED (
          SELECT tp.id AS old_id, uuidv7() AS new_id,
            COALESCE(m.new_id, tp.place_id) AS place_id, tp.created_at
          FROM trip_places tp LEFT JOIN place_map m ON m.old_id = tp.place_id
          WHERE tp.trip_id = ${source.tripId}::uuid
        ),
        new_trip_places AS (
          INSERT INTO trip_places (id, trip_id, place_id, note, created_at, updated_at)
          SELECT tm.new_id, (SELECT id FROM new_trip), tm.place_id, NULL, tm.created_at, ${now}
          FROM trip_place_map tm
        ),
        day_map AS MATERIALIZED (
          SELECT d.id AS old_id, uuidv7() AS new_id, d.position, d.mode_override
          FROM days d WHERE d.trip_id = ${source.tripId}::uuid
        ),
        new_days AS (
          INSERT INTO days (id, trip_id, position, mode_override, created_at)
          SELECT dm.new_id, (SELECT id FROM new_trip), dm.position, dm.mode_override, ${now}
          FROM day_map dm
        ),
        new_stops AS (
          INSERT INTO stops (trip_id, day_id, trip_place_id, position, mode_to_next, created_at)
          SELECT (SELECT id FROM new_trip), dm.new_id, tm.new_id, s.position, s.mode_to_next, ${now}
          FROM stops s
          JOIN day_map dm ON dm.old_id = s.day_id
          JOIN trip_place_map tm ON tm.old_id = s.trip_place_id
        )
        SELECT id::text AS id FROM new_trip`;
      if (!copy) {
        throw tripNotFound();
      }
      return copy.id;
    });
    return toTripOwner(await this.read(copyId));
  }

  /** A trip the caller may read; 404 when it was deleted meanwhile. */
  private async read(tripId: string): Promise<TripRow> {
    const row = await this.prisma.trip.findUnique({ where: { id: tripId }, select: TRIP_SELECT });
    if (!row) {
      throw tripNotFound();
    }
    return row;
  }
}
