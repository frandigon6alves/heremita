import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LIMITS,
  type EndpointInput,
  type endpoints,
  type PlaceDetail,
  type PlaceResults,
  type RatingSummary,
} from '@heremita/shared';
import { andAuthorNotBlockedBy } from '../core/block-filter.js';
import { ApiProblem } from '../core/http/api-problem.js';
import { summariseRatings, RatingSummaryReader } from '../core/rating-summary.reader.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  GEOCODING_PROVIDER,
  ProviderError,
  type GeocodingProvider,
  type PlaceResult,
} from '../providers/core/contract.js';
import { haversineMeters } from '../providers/core/geo.js';
import { PlaceResolver } from '../providers/core/place-resolver.js';
import { REVIEW_SELECT, toReview } from '../reviews/review.mapper.js';
import { SEARCH_FALLBACK, searchWithFallback, type PlaceSearcher } from './search-fallback.js';

type SearchInput = EndpointInput<typeof endpoints.searchPlaces>['query'];
type ReverseInput = EndpointInput<typeof endpoints.reversePlaces>['query'];

/** Seconds a client waits before searching again when Photon's token bucket is empty. */
const BUSY_RETRY_AFTER_SECONDS = 1;

interface EnrichmentRow {
  key: string;
  placeId: string;
  rating: number | null;
  count: number;
}

/**
 * Place search (E42), reverse geocoding (E43) and the place page (E44).
 * Every place served by search or reverse is remembered (`place:v1:`), so
 * saving it later needs no upstream call.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly geocoder: GeocodingProvider,
    @Inject(SEARCH_FALLBACK) private readonly fallback: PlaceSearcher | null,
    private readonly resolver: PlaceResolver,
    private readonly ratings: RatingSummaryReader,
    private readonly prisma: PrismaService,
  ) {}

  /** E42. */
  async search(query: SearchInput, viewerId: string): Promise<PlaceResults> {
    const places = await this.geocoding(() =>
      searchWithFallback(
        this.geocoder,
        this.fallback,
        {
          text: query.q,
          locale: query.locale,
          intent: query.intent,
          ...(query.near && { bias: { center: query.near, zoom: query.zoom } }),
          ...(query.within && { within: query.within }),
          ...(query.categories && { categories: query.categories }),
          limit: query.limit,
        },
        this.logger,
      ),
    );
    return this.serve(places, viewerId);
  }

  /** E43: nearest first, within `REVERSE_RADIUS_KM`. */
  async reverse(query: ReverseInput, viewerId: string): Promise<PlaceResults> {
    const point = { lng: query.lng, lat: query.lat };
    const places = await this.geocoding(() =>
      this.geocoder.reverse({
        point,
        locale: query.locale,
        radiusMeters: LIMITS.REVERSE_RADIUS_KM * 1000,
        limit: LIMITS.REVERSE_LIMIT,
      }),
    );
    const nearestFirst = places
      .map((place) => ({ place, distance: haversineMeters(point, place.location) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ place }) => place);
    return this.serve(nearestFirst, viewerId);
  }

  /** E44. Custom places are 404 for everyone: they exist only inside their trip. */
  async detail(placeId: string, viewerId: string | null): Promise<PlaceDetail> {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, source: 'osm' },
      select: {
        id: true,
        source: true,
        osmType: true,
        osmId: true,
        name: true,
        label: true,
        category: true,
        lng: true,
        lat: true,
        countryCode: true,
      },
    });
    if (!place) {
      throw new ApiProblem('place_not_found', 'No such place.');
    }
    const [ratings, inMyTrips, myReview] = await Promise.all([
      this.ratings.read([place.id], viewerId),
      viewerId === null ? [] : this.tripsHolding(place.id, viewerId),
      viewerId === null ? null : this.reviewBy(place.id, viewerId),
    ]);
    return {
      place: {
        id: place.id,
        source: place.source,
        key: place.osmType && place.osmId !== null ? `osm:${place.osmType}:${place.osmId}` : null,
        name: place.name,
        label: place.label,
        category: place.category,
        location: { lng: place.lng, lat: place.lat },
        countryCode: place.countryCode,
      },
      rating: ratings.get(place.id) ?? summariseRatings([0, 0, 0, 0, 0]),
      inMyTrips,
      myReview,
    };
  }

  /** Runs a provider call, turning its failure into the 503 the client can act on. */
  private async geocoding(call: () => Promise<PlaceResult[]>): Promise<PlaceResult[]> {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ProviderError)) {
        throw error;
      }
      if (error.kind === 'rate_limited') {
        throw new ApiProblem(
          'geocoding_busy',
          'Place search is busy; try again shortly.',
          {},
          error.retryAfterSeconds ?? BUSY_RETRY_AFTER_SECONDS,
        );
      }
      this.logger.warn(`Geocoder ${error.provider} failed (${error.kind})`);
      throw new ApiProblem('geocoding_unavailable', 'Place search is unavailable right now.');
    }
  }

  /** Remembers what is served and adds `placeId` + `rating` for places that already have a row. */
  private async serve(places: readonly PlaceResult[], viewerId: string): Promise<PlaceResults> {
    const [known] = await Promise.all([
      this.knownPlaces(places, viewerId),
      this.resolver.remember(places),
    ]);
    return {
      items: places.map((place) => {
        const row = known.get(place.key);
        return { ...place, placeId: row?.placeId ?? null, rating: row?.rating ?? null };
      }),
    };
  }

  /**
   * Canonical rows of the given places with their rating summaries, in one
   * grouped query (published reviews, authors the viewer blocked left out).
   */
  private async knownPlaces(
    places: readonly PlaceResult[],
    viewerId: string,
  ): Promise<Map<string, { placeId: string; rating: RatingSummary }>> {
    if (places.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.$queryRaw<EnrichmentRow[]>`
      SELECT 'osm:' || p.osm_type::text || ':' || p.osm_id::text AS key,
             p.id::text AS "placeId", r.rating::int AS rating, count(r.id)::int AS count
      FROM unnest(${places.map((place) => place.ref.osmType)}::"OsmType"[],
                  ${places.map((place) => String(place.ref.osmId))}::bigint[]) AS k(osm_type, osm_id)
      JOIN places p ON p.osm_type = k.osm_type AND p.osm_id = k.osm_id
      LEFT JOIN reviews r ON r.place_id = p.id AND r.status = 'published'
        ${andAuthorNotBlockedBy(viewerId, Prisma.raw('r.author_id'))}
      GROUP BY p.id, p.osm_type, p.osm_id, r.rating`;
    const counts = new Map<
      string,
      { placeId: string; perStar: [number, number, number, number, number] }
    >();
    for (const row of rows) {
      const entry = counts.get(row.key) ?? { placeId: row.placeId, perStar: [0, 0, 0, 0, 0] };
      // reviews_rating_chk keeps rating within 1..5; null = a place without reviews.
      if (row.rating !== null) {
        entry.perStar[row.rating - 1] = row.count;
      }
      counts.set(row.key, entry);
    }
    return new Map(
      [...counts].map(([key, { placeId, perStar }]) => [
        key,
        { placeId, rating: summariseRatings(perStar) },
      ]),
    );
  }

  private async tripsHolding(placeId: string, viewerId: string): Promise<PlaceDetail['inMyTrips']> {
    const rows = await this.prisma.tripPlace.findMany({
      where: { placeId, trip: { ownerId: viewerId } },
      orderBy: [{ trip: { updatedAt: 'desc' } }, { tripId: 'desc' }],
      select: { id: true, trip: { select: { id: true, title: true } } },
    });
    return rows.map((row) => ({
      tripId: row.trip.id,
      tripTitle: row.trip.title,
      tripPlaceId: row.id,
    }));
  }

  /** The viewer's own review, hidden or not (authors see their hidden reviews). */
  private async reviewBy(placeId: string, viewerId: string): Promise<PlaceDetail['myReview']> {
    const review = await this.prisma.review.findUnique({
      where: { placeId_authorId: { placeId, authorId: viewerId } },
      select: REVIEW_SELECT,
    });
    return review ? toReview(review, viewerId) : null;
  }
}
