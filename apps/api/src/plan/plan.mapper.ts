import type {
  DayOwner,
  DayViewer,
  PlaceSummary,
  RatingSummary,
  TravelMode,
  TripPlaceOwner,
  TripPlaceViewer,
} from '@heremita/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { toIsoDate } from '../trips/trip.mapper.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const PLACE_SUMMARY_SELECT = {
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
} as const satisfies Prisma.PlaceSelect;

type PlaceSummaryRow = Prisma.PlaceGetPayload<{ select: typeof PLACE_SUMMARY_SELECT }>;

export const TRIP_PLACE_SELECT = {
  id: true,
  note: true,
  createdAt: true,
  place: { select: PLACE_SUMMARY_SELECT },
} as const satisfies Prisma.TripPlaceSelect;

export type TripPlaceRow = Prisma.TripPlaceGetPayload<{ select: typeof TRIP_PLACE_SELECT }>;

export function toPlaceSummary(row: PlaceSummaryRow): PlaceSummary {
  return {
    id: row.id,
    source: row.source,
    key: row.osmType && row.osmId !== null ? `osm:${row.osmType}:${row.osmId}` : null,
    name: row.name,
    label: row.label,
    category: row.category,
    location: { lng: row.lng, lat: row.lat },
    countryCode: row.countryCode,
  };
}

/** The viewer shape leaves the owner's note out. */
export function toTripPlaceViewer(row: TripPlaceRow, rating: RatingSummary): TripPlaceViewer {
  return {
    id: row.id,
    place: toPlaceSummary(row.place),
    rating,
    addedAt: row.createdAt.toISOString(),
  };
}

export function toTripPlaceOwner(row: TripPlaceRow, rating: RatingSummary): TripPlaceOwner {
  return { ...toTripPlaceViewer(row, rating), note: row.note };
}

/** Day `n`'s date: the trip start plus `n − 1` days (owner only). */
export function dayDate(startDate: Date | null, position: number): string | null {
  return startDate && toIsoDate(new Date(startDate.getTime() + position * DAY_MS));
}

export function toDayOwner(
  day: { id: string; position: number; modeOverride: TravelMode | null },
  trip: { defaultMode: TravelMode; startDate: Date | null },
  stops: DayOwner['stops'],
): DayOwner {
  return {
    id: day.id,
    number: day.position + 1,
    date: dayDate(trip.startDate, day.position),
    mode: day.modeOverride ?? trip.defaultMode,
    modeOverride: day.modeOverride,
    stops,
  };
}

/** The viewer shape leaves the owner's dates out. */
export function toDayViewer(day: DayOwner): DayViewer {
  return {
    id: day.id,
    number: day.number,
    mode: day.mode,
    modeOverride: day.modeOverride,
    stops: day.stops,
  };
}
