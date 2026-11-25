// Compact, model-friendly shapes of API answers: what an assistant needs to
// reason about a trip, without ids it cannot use or fields it would misread.
import type { PlaceSummary, TripPlan } from '@heremita/shared';

export interface PlaceLine {
  name: string;
  category: string;
  /** Id of the place page (`get_place`); custom pins have none worth opening. */
  placeId: string | null;
  location: { lat: number; lng: number };
}

function line(place: PlaceSummary): PlaceLine {
  return {
    name: place.name,
    category: place.category,
    placeId: place.source === 'osm' ? place.id : null,
    location: { lat: place.location.lat, lng: place.location.lng },
  };
}

/** A trip as days of places in visiting order, plus the ideas on no day. */
export function tripOutline(plan: TripPlan, url: string) {
  const byId = new Map(plan.places.map((entry) => [entry.id, entry.place]));
  const scheduled = new Set(plan.days.flatMap((day) => day.stops.map((stop) => stop.tripPlaceId)));
  return {
    tripId: plan.trip.id,
    title: plan.trip.title,
    destination: plan.trip.destination?.name ?? null,
    yours: plan.viewerRole === 'owner',
    url,
    days: plan.days.map((day) => ({
      number: day.number,
      date: 'date' in day ? day.date : null,
      mode: day.mode,
      places: day.stops.flatMap((stop) => {
        const place = byId.get(stop.tripPlaceId);
        return place ? [line(place)] : [];
      }),
    })),
    ideas: plan.places
      .filter((entry) => !scheduled.has(entry.id))
      .map((entry) => line(entry.place)),
  };
}
