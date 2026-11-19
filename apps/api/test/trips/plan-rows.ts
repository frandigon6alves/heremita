import type { TravelMode } from '../../src/generated/prisma/client.js';
import type { TestApp } from '../support/app.js';

/**
 * Writes plan rows straight to the database, for trip tests that need places
 * and stops without depending on the plan endpoints.
 */
export class PlanRows {
  private osmId = 0;

  constructor(private readonly t: TestApp) {}

  /** Day ids of a trip, in day order. */
  async dayIds(tripId: string): Promise<string[]> {
    const days = await this.t.prisma.day.findMany({
      where: { tripId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    return days.map((day) => day.id);
  }

  /** A trip place on a canonical (OSM) place of its own, with an optional note. */
  async osmPlace(tripId: string, lng: number, lat: number, note: string | null = null) {
    this.osmId += 1;
    const place = await this.t.prisma.place.create({
      data: {
        source: 'osm',
        osmType: 'N',
        osmId: this.osmId,
        name: `Place ${this.osmId}`,
        category: 'sight',
        lng,
        lat,
      },
    });
    return this.t.prisma.tripPlace.create({ data: { tripId, placeId: place.id, note } });
  }

  /** A custom pin of the trip and its trip place. */
  async customPlace(tripId: string, name: string, lng: number, lat: number) {
    const place = await this.t.prisma.place.create({
      data: { source: 'custom', tripId, name, category: 'lodging', lng, lat },
    });
    return this.t.prisma.tripPlace.create({
      data: { tripId, placeId: place.id, note: 'door code 1234' },
    });
  }

  stop(
    tripId: string,
    dayId: string,
    tripPlaceId: string,
    position: number,
    modeToNext: TravelMode | null = null,
  ) {
    return this.t.prisma.stop.create({
      data: { tripId, dayId, tripPlaceId, position, modeToNext },
    });
  }
}
