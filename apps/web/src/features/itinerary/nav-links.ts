import type { LngLat, TravelMode } from '@heremita/shared';

const GOOGLE_TRAVEL_MODE: Record<TravelMode, string> = {
  walk: 'walking',
  bike: 'bicycling',
  drive: 'driving',
};

const APPLE_MODE: Record<TravelMode, string> = {
  walk: 'walking',
  bike: 'cycling',
  drive: 'driving',
};

const coordinates = ({ lng, lat }: LngLat) => `${lat},${lng}`;

/** One leg in Google Maps directions (universal URL: app when installed, else web). */
export function googleMapsLegUrl(from: LngLat, to: LngLat, mode: TravelMode): string {
  const params = new URLSearchParams({
    api: '1',
    origin: coordinates(from),
    destination: coordinates(to),
    travelmode: GOOGLE_TRAVEL_MODE[mode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** One leg in Apple Maps directions (unified `maps.apple.com/directions` URL). */
export function appleMapsLegUrl(from: LngLat, to: LngLat, mode: TravelMode): string {
  const params = new URLSearchParams({
    source: coordinates(from),
    destination: coordinates(to),
    mode: APPLE_MODE[mode],
  });
  return `https://maps.apple.com/directions?${params.toString()}`;
}
