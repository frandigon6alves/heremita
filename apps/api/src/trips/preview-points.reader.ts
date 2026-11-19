import { Injectable } from '@nestjs/common';
import { LIMITS, type LngLat } from '@heremita/shared';
import { PrismaService } from '../prisma/prisma.service.js';

interface PointRow {
  tripId: string;
  lng: number;
  lat: number;
}

/**
 * The points a trip card draws: its stops in visit order (day by day), then its
 * ideas, at most `PREVIEW_POINTS_MAX` per trip. One query for a whole page of cards.
 */
@Injectable()
export class PreviewPointsReader {
  constructor(private readonly prisma: PrismaService) {}

  /** Points of every requested trip (`[]` for a trip without places). */
  async read(tripIds: readonly string[]): Promise<Map<string, LngLat[]>> {
    const points = new Map<string, LngLat[]>(tripIds.map((id) => [id, []]));
    if (tripIds.length === 0) {
      return points;
    }
    const rows = await this.prisma.$queryRaw<PointRow[]>`
      SELECT ranked.trip_id::text AS "tripId", ranked.lng, ranked.lat
      FROM (
        SELECT tp.trip_id, p.lng, p.lat,
          row_number() OVER (
            PARTITION BY tp.trip_id
            ORDER BY s.id IS NULL, d.position, s.position, tp.created_at, tp.id
          ) AS n
        FROM trip_places tp
        JOIN places p ON p.id = tp.place_id
        LEFT JOIN stops s ON s.trip_place_id = tp.id
        LEFT JOIN days d ON d.id = s.day_id
        WHERE tp.trip_id = ANY(${[...tripIds]}::uuid[])
      ) ranked
      WHERE ranked.n <= ${LIMITS.PREVIEW_POINTS_MAX}
      ORDER BY ranked.trip_id, ranked.n`;
    for (const row of rows) {
      points.get(row.tripId)?.push({ lng: row.lng, lat: row.lat });
    }
    return points;
  }
}
