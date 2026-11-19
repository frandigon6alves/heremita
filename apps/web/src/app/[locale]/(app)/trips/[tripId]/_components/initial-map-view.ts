import type { Destination } from '@heremita/shared';
import type { PlanLike } from '@/features/itinerary/plan-view';
import type { InitialView } from '@/shared/map/map-view';
import { boundsOf } from '@/shared/map/geo';

const PLACE_ZOOM = 15;
const DESTINATION_ZOOM = 12;
const WORLD: InitialView = { center: [0, 20], zoom: 1 };

/** First camera: the trip's places, else its destination, else the world. */
export function initialMapView(
  plan: PlanLike & { trip: { destination: Destination | null } },
): InitialView {
  const points = plan.places.map(({ place }) => [place.location.lng, place.location.lat] as const);
  const [only] = points;
  if (points.length === 1 && only) {
    return { center: [only[0], only[1]], zoom: PLACE_ZOOM };
  }
  const bounds = boundsOf(points);
  if (bounds) {
    return { bounds };
  }
  const center = plan.trip.destination?.center;
  return center ? { center: [center.lng, center.lat], zoom: DESTINATION_ZOOM } : WORLD;
}
