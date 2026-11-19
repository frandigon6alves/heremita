import type { PlaceResult } from '@heremita/shared';

/** A geocoder hit as E42/E43 return it. */
export function buildPlaceResult(overrides: Partial<PlaceResult> = {}): PlaceResult {
  return {
    key: 'osm:W:1370081491',
    ref: { osmType: 'W', osmId: 1370081491 },
    name: 'Museu Nacional do Azulejo',
    label: 'Rua da Madre de Deus 4, Lisboa',
    category: 'culture',
    kind: 'poi',
    location: { lng: -9.1135, lat: 38.7247 },
    address: { city: 'Lisboa', countryCode: 'PT' },
    placeId: null,
    rating: null,
    ...overrides,
  };
}
