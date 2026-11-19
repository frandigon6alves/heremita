import { Inject, Injectable } from '@nestjs/common';
import {
  LIMITS,
  type AddTripPlaceResponse,
  type EndpointInput,
  type endpoints,
  type PlanChange,
  type UpdateTripPlaceResponse,
} from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { ApiProblem } from '../core/http/api-problem.js';
import { tripNotFound } from '../core/http/problems.js';
import type { SessionUser } from '../core/http/api-request.js';
import { ratingOf, RatingSummaryReader } from '../core/rating-summary.reader.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PlaceResult } from '../providers/core/contract.js';
import { PlaceResolver } from '../providers/core/place-resolver.js';
import { writeDayOrder } from './day-order.js';
import { holdPlan, lockPlan } from './plan-lock.js';
import { toTripPlaceOwner, TRIP_PLACE_SELECT } from './plan.mapper.js';
import { dayOfTrip, insertStop, stopIdsOf, tripPlaceNotFound } from './plan-queries.js';

type AddTripPlaceBody = EndpointInput<typeof endpoints.addTripPlace>['body'];
type UpdateTripPlaceBody = EndpointInput<typeof endpoints.updateTripPlace>['body'];
type CustomPlaceInput = Extract<AddTripPlaceBody['place'], { type: 'custom' }>;

const LABEL_MAX = 300;

/** The new place row: the resolved canonical place, or the custom pin as sent. */
type PlaceSource = { type: 'osm'; place: PlaceResult } | CustomPlaceInput;

function countryCodeOf(place: PlaceResult): string | null {
  const code = place.address.countryCode?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * The canonical row of an OSM place, created on first save: written only from
 * what the resolver returned, never from client input. An existing row is
 * only marked as seen.
 */
async function upsertCanonicalPlace(
  tx: Prisma.TransactionClient,
  place: PlaceResult,
  now: Date,
): Promise<string> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO places (source, osm_type, osm_id, name, label, category, osm_key, osm_value,
      lng, lat, address, country_code, last_seen_at, created_at, updated_at)
    VALUES ('osm', ${place.ref.osmType}::"OsmType", ${place.ref.osmId}::bigint,
      ${place.name.slice(0, LIMITS.PLACE_NAME_MAX)}, ${place.label.slice(0, LABEL_MAX) || null},
      ${place.category}::"PlaceCategory", ${place.osmKey}, ${place.osmValue},
      ${place.location.lng}::float8, ${place.location.lat}::float8,
      ${JSON.stringify(place.address)}::jsonb, ${countryCodeOf(place)}, ${now}, ${now}, ${now})
    ON CONFLICT (osm_type, osm_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
    RETURNING id::text AS id`;
  if (!row) {
    throw new Error(`Upserting place ${place.key} returned no row`);
  }
  return row.id;
}

/** Places saved to a trip, with their notes (E29–E31). */
@Injectable()
export class TripPlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PlaceResolver,
    private readonly ratings: RatingSummaryReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * E29: an OSM place is resolved by key before the transaction (cache, else
   * lookup, else 503); a custom pin gets a place row of this trip. With a
   * `schedule` the place also becomes a stop of that day.
   */
  async add(
    user: SessionUser,
    tripId: string,
    body: AddTripPlaceBody,
  ): Promise<AddTripPlaceResponse> {
    const source: PlaceSource =
      body.place.type === 'osm'
        ? { type: 'osm', place: await this.resolve(user, tripId, body.place.key) }
        : body.place;
    const now = this.clock.now();
    const added = await this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, user.id, now);
      if (body.schedule) {
        await dayOfTrip(tx, tripId, body.schedule.dayId);
      }
      const placeCount = await tx.tripPlace.count({ where: { tripId } });
      if (placeCount >= LIMITS.PLACES_PER_TRIP) {
        throw new ApiProblem(
          'limit_reached',
          `A trip holds at most ${LIMITS.PLACES_PER_TRIP} places.`,
        );
      }
      const placeId = await this.placeRow(tx, tripId, source, now);
      const existing = await tx.tripPlace.findUnique({
        where: { tripId_placeId: { tripId, placeId } },
        select: { id: true },
      });
      if (existing) {
        throw new ApiProblem('place_already_in_trip', 'This place is already in the trip.', {
          tripPlaceId: existing.id,
        });
      }
      const tripPlace = await tx.tripPlace.create({
        data: { tripId, placeId, note: body.note, createdAt: now, updatedAt: now },
        select: TRIP_PLACE_SELECT,
      });
      const stopId = body.schedule
        ? await insertStop(
            tx,
            {
              tripId,
              dayId: body.schedule.dayId,
              tripPlaceId: tripPlace.id,
              index: body.schedule.index,
            },
            now,
          )
        : null;
      return { tripPlace, stopId, planVersion: plan.planVersion };
    });
    const ratings = await this.ratings.read([added.tripPlace.place.id], user.id);
    return {
      tripPlace: toTripPlaceOwner(added.tripPlace, ratingOf(ratings, added.tripPlace.place.id)),
      stopId: added.stopId,
      planVersion: added.planVersion,
    };
  }

  /**
   * E30: the note of any trip place; name, category and location of a custom
   * pin only. The plan version moves on only when the pin's location changes.
   */
  async update(
    user: SessionUser,
    tripId: string,
    tripPlaceId: string,
    body: UpdateTripPlaceBody,
  ): Promise<UpdateTripPlaceResponse> {
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const version = await holdPlan(tx, tripId, user.id);
      const current = await tx.tripPlace.findFirst({
        where: { id: tripPlaceId, tripId },
        select: { place: { select: { id: true, source: true, lng: true, lat: true } } },
      });
      if (!current) {
        throw tripPlaceNotFound();
      }
      const { place } = current;
      const placeEdit =
        body.name !== undefined || body.category !== undefined || body.location !== undefined;
      if (placeEdit && place.source !== 'custom') {
        throw new ApiProblem(
          'not_a_custom_place',
          'Only a custom place can be renamed, recategorised or moved.',
        );
      }
      const moved =
        body.location !== undefined &&
        (body.location.lng !== place.lng || body.location.lat !== place.lat);
      const planVersion = moved ? (await lockPlan(tx, tripId, user.id, now)).planVersion : version;
      if (placeEdit) {
        await tx.place.update({
          where: { id: place.id },
          data: {
            name: body.name,
            category: body.category,
            lng: body.location?.lng,
            lat: body.location?.lat,
            updatedAt: now,
          },
        });
      }
      const tripPlace = await tx.tripPlace.update({
        where: { id: tripPlaceId },
        data: { note: body.note, updatedAt: now },
        select: TRIP_PLACE_SELECT,
      });
      return { tripPlace, planVersion };
    });
    const ratings = await this.ratings.read([updated.tripPlace.place.id], user.id);
    return {
      tripPlace: toTripPlaceOwner(updated.tripPlace, ratingOf(ratings, updated.tripPlace.place.id)),
      planVersion: updated.planVersion,
    };
  }

  /** E31: its stops leave their days (which close up), and a custom pin's place row goes too. */
  async delete(userId: string, tripId: string, tripPlaceId: string): Promise<PlanChange> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const plan = await lockPlan(tx, tripId, userId, now);
      const tripPlace = await tx.tripPlace.findFirst({
        where: { id: tripPlaceId, tripId },
        select: {
          placeId: true,
          place: { select: { source: true } },
          stops: { select: { dayId: true } },
        },
      });
      if (!tripPlace) {
        throw tripPlaceNotFound();
      }
      await tx.tripPlace.delete({ where: { id: tripPlaceId } });
      if (tripPlace.place.source === 'custom') {
        await tx.place.delete({ where: { id: tripPlace.placeId } });
      }
      for (const dayId of new Set(tripPlace.stops.map((stop) => stop.dayId))) {
        await writeDayOrder(tx, dayId, await stopIdsOf(tx, dayId));
      }
      return { planVersion: plan.planVersion };
    });
  }

  /**
   * Resolves an OSM key before any transaction opens (no network inside one).
   * The trip is checked first, so another user's trip never costs a lookup.
   */
  private async resolve(user: SessionUser, tripId: string, key: string): Promise<PlaceResult> {
    const owned = await this.prisma.trip.count({ where: { id: tripId, ownerId: user.id } });
    if (owned === 0) {
      throw tripNotFound();
    }
    return this.resolver.resolve(key, user.locale);
  }

  private async placeRow(
    tx: Prisma.TransactionClient,
    tripId: string,
    source: PlaceSource,
    now: Date,
  ): Promise<string> {
    if (source.type === 'osm') {
      return upsertCanonicalPlace(tx, source.place, now);
    }
    const place = await tx.place.create({
      data: {
        source: 'custom',
        tripId,
        name: source.name,
        category: source.category,
        lng: source.location.lng,
        lat: source.location.lat,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    return place.id;
  }
}
