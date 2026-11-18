import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiProblem } from './http/api-problem.js';
import { decideTripAccess, type TripRef, type TripRole } from './trip-access.js';

export interface TripAccess {
  tripId: string;
  role: TripRole;
}

const ACCESS_COLUMNS = {
  id: true,
  ownerId: true,
  visibility: true,
  moderationHiddenAt: true,
} as const;

/** The one place that decides whether a viewer may read a trip, for every trip-scoped read. */
@Injectable()
export class TripAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The trip's id and the viewer's role, or `null` when the trip must look missing. */
  async resolve(ref: TripRef, viewer: { id: string } | null): Promise<TripAccess | null> {
    const trip =
      'tripId' in ref
        ? await this.prisma.trip.findUnique({ where: { id: ref.tripId }, select: ACCESS_COLUMNS })
        : await this.prisma.trip.findUnique({
            where: { shareToken: ref.shareToken },
            select: ACCESS_COLUMNS,
          });
    const role = decideTripAccess(trip, 'tripId' in ref ? 'id' : 'token', viewer?.id ?? null);
    return trip && role ? { tripId: trip.id, role } : null;
  }

  /** {@link resolve}, answering 404 `trip_not_found` instead of `null`. */
  async require(ref: TripRef, viewer: { id: string } | null): Promise<TripAccess> {
    const access = await this.resolve(ref, viewer);
    if (!access) {
      throw new ApiProblem('trip_not_found', 'No such trip.');
    }
    return access;
  }
}
