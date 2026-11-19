import { Injectable } from '@nestjs/common';
import type { TravelMode } from '@heremita/shared';
import { dayNotFound } from '../core/http/problems.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RouteStop } from './planned-legs.js';

/** A day's stops in visit order, with what decides each leg's mode. */
export interface DayStops {
  dayId: string;
  planVersion: number;
  /** `day.modeOverride ?? trip.defaultMode`. */
  dayMode: TravelMode;
  stops: RouteStop[];
}

/** Reads a day of a trip whose access the caller already checked. */
@Injectable()
export class DayStopsReader {
  constructor(private readonly prisma: PrismaService) {}

  /** The day's stops, or 404 `not_found` when the day is not one of this trip's. */
  async read(tripId: string, dayId: string): Promise<DayStops> {
    const day = await this.prisma.day.findFirst({
      where: { id: dayId, tripId },
      select: {
        modeOverride: true,
        trip: { select: { planVersion: true, defaultMode: true } },
        stops: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            modeToNext: true,
            tripPlace: { select: { place: { select: { lng: true, lat: true } } } },
          },
        },
      },
    });
    if (!day) {
      throw dayNotFound();
    }
    return {
      dayId,
      planVersion: day.trip.planVersion,
      dayMode: day.modeOverride ?? day.trip.defaultMode,
      stops: day.stops.map((stop) => ({
        id: stop.id,
        location: { lng: stop.tripPlace.place.lng, lat: stop.tripPlace.place.lat },
        modeToNext: stop.modeToNext,
      })),
    };
  }
}
