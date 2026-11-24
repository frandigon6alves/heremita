import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EndpointInput, LngLat, PlaceSuggestions, endpoints } from '@heremita/shared';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { ApiProblem } from '../core/http/api-problem.js';
import { tripNotFound } from '../core/http/problems.js';
import { geocodingProblem, PlacesService } from '../places/places.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GEOCODING_PROVIDER, type GeocodingProvider } from '../providers/core/contract.js';
import { DailyBudget } from './daily-budget.js';
import { groundIdeas, searchNear } from './grounding.js';
import {
  EXTRA_IDEAS,
  IDEA_GENERATOR,
  IdeaGeneratorError,
  type IdeaBatch,
  type IdeaGenerator,
} from './idea-generator.js';

type SuggestBody = EndpointInput<typeof endpoints.suggestPlaces>['body'];

/**
 * E52: place ideas for a trip, from the configured generator, each one grounded
 * in a real geocoder hit near the trip (V77). Writes nothing (V76); the owner
 * adds a pick with E29.
 */
@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(
    @Inject(IDEA_GENERATOR) private readonly generator: IdeaGenerator | null,
    @Inject(GEOCODING_PROVIDER) private readonly geocoder: GeocodingProvider,
    private readonly budget: DailyBudget,
    private readonly places: PlacesService,
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async suggest(userId: string, tripId: string, body: SuggestBody): Promise<PlaceSuggestions> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, ownerId: userId },
      select: {
        destinationName: true,
        destinationCountryCode: true,
        destinationLng: true,
        destinationLat: true,
        tripPlaces: {
          select: {
            place: { select: { name: true, osmType: true, osmId: true, lng: true, lat: true } },
          },
        },
      },
    });
    if (!trip) {
      throw tripNotFound();
    }
    const places = trip.tripPlaces.map(({ place }) => place);
    const center = tripCenter(trip, places);
    if (!center) {
      throw new ApiProblem(
        'destination_required',
        'Give the trip a destination or add a place first, so suggestions know where to look.',
      );
    }
    if (!this.generator) {
      throw new ApiProblem('ai_unavailable', 'AI suggestions are turned off on this server.');
    }
    const decision = this.budget.take();
    if (!decision.ok) {
      throw new ApiProblem(
        'ai_quota_exhausted',
        'AI suggestions are used up for today; try again tomorrow.',
        {},
        decision.retryAfterSeconds,
      );
    }

    const startedAt = this.clock.now().getTime();
    const batch = await this.ideas(this.generator, {
      prompt: body.prompt,
      locale: body.locale,
      count: body.count + EXTRA_IDEAS,
      destination: {
        name: trip.destinationName,
        countryCode: trip.destinationCountryCode,
        center,
      },
      alreadyInTrip: places.map((place) => place.name),
    });

    const excludeKeys = new Set(
      places.flatMap((place) =>
        place.osmType && place.osmId !== null ? [`osm:${place.osmType}:${place.osmId}`] : [],
      ),
    );
    const grounded = await groundIdeas(
      { ideas: batch.ideas, center, count: body.count, excludeKeys },
      searchNear(this.geocoder, body.locale, center),
    );
    if (grounded.failure && grounded.items.length === 0) {
      throw geocodingProblem(grounded.failure, this.logger);
    }

    // V78: counts and timings only, never the prompt or the model's text.
    this.logger.log(
      `Suggestions trip=${tripId} generator=${this.generator.id} model=${batch.model} ` +
        `ideas=${batch.ideas.length} grounded=${grounded.items.length} dropped=${grounded.dropped} ` +
        `geocoderFailed=${grounded.failure !== null} ` +
        `inputTokens=${batch.usage?.inputTokens ?? 0} outputTokens=${batch.usage?.outputTokens ?? 0} ` +
        `ms=${this.clock.now().getTime() - startedAt}`,
    );

    const served = await this.places.serve(
      grounded.items.map((item) => item.place),
      userId,
    );
    return {
      items: served.items.map((place, index) => ({
        place,
        reason: grounded.items[index]?.reason ?? '',
      })),
      dropped: grounded.dropped,
    };
  }

  private async ideas(
    generator: IdeaGenerator,
    request: Parameters<IdeaGenerator['generate']>[0],
  ): Promise<IdeaBatch> {
    try {
      return await generator.generate(request);
    } catch (error) {
      if (!(error instanceof IdeaGeneratorError)) {
        throw error;
      }
      this.logger.warn(`Idea generator ${generator.id} failed (${error.kind})`);
      throw new ApiProblem(
        'ai_unavailable',
        error.kind === 'refused'
          ? 'The AI could not answer this request; try wording it differently.'
          : 'AI suggestions are unavailable right now; try again shortly.',
      );
    }
  }
}

interface TripLocation {
  destinationLng: number | null;
  destinationLat: number | null;
}

/** The destination's centre, else the middle of the trip's places, else none. */
export function tripCenter(trip: TripLocation, places: readonly LngLat[]): LngLat | null {
  if (trip.destinationLng !== null && trip.destinationLat !== null) {
    return { lng: trip.destinationLng, lat: trip.destinationLat };
  }
  if (places.length === 0) {
    return null;
  }
  const sum = places.reduce(
    (acc, place) => ({ lng: acc.lng + place.lng, lat: acc.lat + place.lat }),
    {
      lng: 0,
      lat: 0,
    },
  );
  return { lng: sum.lng / places.length, lat: sum.lat / places.length };
}
