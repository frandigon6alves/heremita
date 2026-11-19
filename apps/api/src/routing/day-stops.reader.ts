import { Injectable } from '@nestjs/common';
import type { LngLat, TravelMode } from '@heremita/shared';
import { ApiProblem } from '../core/http/api-problem.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PlannedLeg } from './leg-router.js';

export interface DayStop {
  id: string;
  location: LngLat;
  modeToNext: TravelMode | null;
}

/** A day's stops in visit order, with what decides each leg's mode. */
export interface DayStops {
  dayId: string;
  planVersion: number;
  /** `day.modeOverride ?? trip.defaultMode`. */
  dayMode: TravelMode;
  stops: DayStop[];
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
      throw new ApiProblem('not_found', 'No such day in this trip.');
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

/**
 * Legs between consecutive `stops`; each leaves its stop in
 * `override ?? stop.modeToNext ?? dayMode`.
 */
export function plannedLegs(
  stops: readonly DayStop[],
  dayMode: TravelMode,
  override?: TravelMode,
): PlannedLeg[] {
  return stops.slice(1).map((to, i) => {
    const from = stops[i]!;
    return {
      fromStopId: from.id,
      toStopId: to.id,
      mode: override ?? from.modeToNext ?? dayMode,
      from: from.location,
      to: to.location,
    };
  });
}
