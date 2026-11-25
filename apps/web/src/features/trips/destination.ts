import type { DestinationInput, PlaceResult } from '@heremita/shared';

const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * What a trip form hands to the destination search it is composed with (the
 * place-search feature): the form keeps the value, the search only reports.
 */
export interface DestinationPicker {
  /** A suggestion was chosen: the trip gets its name, country and map centre. */
  onPick: (place: PlaceResult) => void;
  /** The text changed (typing, clearing, or the name a pick writes into the field). */
  onText: (text: string) => void;
  /** Text the field starts with: the saved destination's name. */
  defaultValue: string;
  /** Id of the destination's error message, while there is one. */
  errorId?: string;
}

/** A geocoder suggestion as a trip destination. */
export function destinationFromPlace(place: PlaceResult): DestinationInput {
  const countryCode = place.address.countryCode?.toUpperCase() ?? null;
  return {
    name: place.name,
    countryCode: countryCode !== null && COUNTRY_CODE.test(countryCode) ? countryCode : null,
    center: { lng: place.location.lng, lat: place.location.lat },
  };
}

/**
 * The destination after the text changed: empty → none; the current name
 * (written by a pick) → unchanged; anything else → a free-text destination
 * without map centre.
 */
export function destinationAfterTyping(
  current: DestinationInput | null,
  text: string,
): DestinationInput | null {
  const name = text.trim();
  if (name === '') {
    return null;
  }
  if (current !== null && current.name === name) {
    return current;
  }
  return { name, countryCode: null, center: null };
}
