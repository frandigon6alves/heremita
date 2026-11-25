import { LIMITS } from '@heremita/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { HeremitaApiError, type HeremitaClient } from './api-client.js';
import { tripOutline } from './format.js';

const localeSchema = z
  .enum(['en', 'es', 'pt-BR'])
  .default('en')
  .describe('Language of place names and AI reasons.');
const idSchema = z.uuid();

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** API refusals reach the assistant as tool errors it can explain, never as crashes. */
async function run(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await work());
  } catch (error) {
    if (error instanceof HeremitaApiError) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Heremita answered ${error.status} ${error.code}: ${error.message}`,
          },
        ],
      };
    }
    throw error;
  }
}

const READ = { readOnlyHint: true, openWorldHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;

/** Read-only tools on public data: no account needed. */
export function registerPublicTools(server: McpServer, client: HeremitaClient): void {
  server.registerTool(
    'search_public_trips',
    {
      title: 'Search public trips',
      description:
        'Find trips other travellers published on Heremita, by destination or title. Answers up to 30 trips with their place and day counts.',
      inputSchema: {
        query: z.string().trim().min(1).max(LIMITS.PUBLIC_TRIPS_Q_MAX).optional(),
        countryCode: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .optional()
          .describe('ISO 3166-1 alpha-2, e.g. PT.'),
      },
      annotations: READ,
    },
    ({ query, countryCode }) =>
      run(async () => {
        const page = await client.call('listPublicTrips', {
          query: { q: query, countryCode, limit: LIMITS.PAGE_SIZES.publicTrips.max },
        });
        return page.items.map((trip) => ({
          tripId: trip.id,
          title: trip.title,
          destination: trip.destinationName,
          countryCode: trip.countryCode,
          days: trip.dayCount,
          places: trip.placeCount,
          mode: trip.defaultMode,
          author: trip.author.displayName,
          url: client.tripUrl(trip.id),
        }));
      }),
  );

  server.registerTool(
    'get_trip_plan',
    {
      title: 'Get a trip plan',
      description:
        "A trip's days with their places in visiting order, and its ideas (places on no day). Works for public trips, and for your own when an account is configured.",
      inputSchema: { tripId: idSchema },
      annotations: READ,
    },
    ({ tripId }) =>
      run(async () => {
        const plan = await client.call('getTripPlan', { params: { tripId } });
        return tripOutline(plan, client.tripUrl(tripId));
      }),
  );

  server.registerTool(
    'get_place',
    {
      title: 'Get a place',
      description: "A place's details, rating and its five most recent reviews.",
      inputSchema: { placeId: idSchema },
      annotations: READ,
    },
    ({ placeId }) =>
      run(async () => {
        const [detail, reviews] = await Promise.all([
          client.call('getPlace', { params: { placeId } }),
          client.call('listPlaceReviews', {
            params: { placeId },
            query: { limit: 5, sort: 'recent' },
          }),
        ]);
        return {
          ...detail.place,
          rating: detail.rating,
          reviews: reviews.items.map((review) => ({
            rating: review.rating,
            body: review.body,
            visitedMonth: review.visitedMonth,
            language: review.language,
          })),
        };
      }),
  );
}

/** Tools on the configured account: reading and planning its own trips. */
export function registerAccountTools(server: McpServer, client: HeremitaClient): void {
  server.registerTool(
    'list_my_trips',
    {
      title: 'List my trips',
      description: 'Your trips on Heremita, most recently changed first.',
      inputSchema: {},
      annotations: READ,
    },
    () =>
      run(async () => {
        const page = await client.call('listMyTrips', {
          query: { limit: LIMITS.PAGE_SIZES.trips.max },
        });
        return page.items.map((trip) => ({
          tripId: trip.id,
          title: trip.title,
          destination: trip.destinationName,
          startDate: trip.startDate,
          days: trip.dayCount,
          places: trip.placeCount,
          visibility: trip.visibility,
        }));
      }),
  );

  server.registerTool(
    'create_trip',
    {
      title: 'Create a trip',
      description:
        'Creates a private trip with empty days. Give the destination centre so place search and AI suggestions know where to look.',
      inputSchema: {
        title: z.string().trim().min(1).max(LIMITS.TRIP_TITLE_MAX),
        destination: z
          .object({
            name: z.string().trim().min(1).max(LIMITS.DESTINATION_NAME_MAX),
            countryCode: z
              .string()
              .regex(/^[A-Z]{2}$/)
              .nullable()
              .default(null),
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
          })
          .optional(),
        days: z.int().min(0).max(LIMITS.DAYS_PER_TRIP).default(1),
        startDate: z.iso.date().optional(),
        mode: z.enum(['walk', 'bike', 'drive']).default('walk'),
      },
      annotations: WRITE,
    },
    ({ title, destination, days, startDate, mode }) =>
      run(async () => {
        const trip = await client.call('createTrip', {
          body: {
            title,
            destination: destination
              ? {
                  name: destination.name,
                  countryCode: destination.countryCode,
                  center: { lat: destination.lat, lng: destination.lng },
                }
              : null,
            dayCount: days,
            startDate: startDate ?? null,
            defaultMode: mode,
          },
        });
        return { tripId: trip.id, title: trip.title, days: trip.dayCount };
      }),
  );

  server.registerTool(
    'search_places',
    {
      title: 'Search places',
      description:
        'Search OpenStreetMap places by name or address. Each result has a `key` to pass to add_place.',
      inputSchema: {
        query: z.string().trim().min(LIMITS.SEARCH_Q_MIN).max(LIMITS.SEARCH_Q_MAX),
        near: z
          .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
          .optional()
          .describe('Ranks results near this point first.'),
        locale: localeSchema,
      },
      annotations: READ,
    },
    ({ query, near, locale }) =>
      run(async () => {
        const results = await client.call('searchPlaces', {
          query: {
            q: query,
            locale,
            intent: 'submit',
            ...(near && { near: `${near.lng},${near.lat}` }),
            limit: 8,
          },
        });
        return results.items.map((place) => ({
          key: place.key,
          name: place.name,
          label: place.label,
          category: place.category,
          location: place.location,
        }));
      }),
  );

  server.registerTool(
    'suggest_places',
    {
      title: 'Suggest places with AI',
      description:
        "Asks Heremita's AI for places that fit a request, near one of your trips. Every answer is a real OpenStreetMap place (ideas the geocoder cannot confirm are dropped). Nothing is saved: add the ones you want with add_place.",
      inputSchema: {
        tripId: idSchema,
        request: z.string().trim().min(3).max(LIMITS.SUGGEST_PROMPT_MAX),
        count: z.int().min(1).max(LIMITS.SUGGEST_COUNT.max).default(LIMITS.SUGGEST_COUNT.default),
        locale: localeSchema,
      },
      annotations: READ,
    },
    ({ tripId, request, count, locale }) =>
      run(async () => {
        const answer = await client.call('suggestPlaces', {
          params: { tripId },
          body: { prompt: request, locale, count },
        });
        return {
          places: answer.items.map(({ place, reason }) => ({
            key: place.key,
            name: place.name,
            label: place.label,
            category: place.category,
            reason,
          })),
          droppedIdeas: answer.dropped,
        };
      }),
  );

  server.registerTool(
    'add_place',
    {
      title: 'Add a place to a trip',
      description:
        "Adds a place (a `key` from search_places or suggest_places) to one of your trips: to a day by its number, or to the trip's ideas.",
      inputSchema: {
        tripId: idSchema,
        key: z.string().regex(/^osm:[NWR]:[1-9]\d{0,19}$/),
        day: z.int().min(1).optional().describe('Day number; omit to add it to the ideas.'),
        note: z.string().trim().max(LIMITS.NOTE_MAX).optional(),
      },
      annotations: WRITE,
    },
    ({ tripId, key, day, note }) =>
      run(async () => {
        let schedule: { dayId: string } | null = null;
        if (day !== undefined) {
          const plan = await client.call('getTripPlan', { params: { tripId } });
          const target = plan.days.find((candidate) => candidate.number === day);
          if (!target) {
            throw new HeremitaApiError(
              404,
              'not_found',
              `The trip has ${plan.days.length} day(s); there is no day ${day}.`,
            );
          }
          schedule = { dayId: target.id };
        }
        const added = await client.call('addTripPlace', {
          params: { tripId },
          body: { place: { type: 'osm', key }, note: note ?? null, schedule },
        });
        return {
          added: added.tripPlace.place.name,
          to: day === undefined ? 'ideas' : `day ${day}`,
        };
      }),
  );
}
