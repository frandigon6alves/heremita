'use client';

import type { TripOwner } from '@heremita/shared';
import { PlaceSearch } from '@/features/place-search';
import { TripSettings } from '@/features/trips/trip-settings';

/** Trip settings with the place search as the destination field. */
export function TripSettingsScreen({ trip }: { trip: TripOwner }) {
  return (
    <TripSettings
      initialTrip={trip}
      renderDestination={({ label, defaultValue, onPick, onText }) => (
        <PlaceSearch
          label={label}
          showLabel
          intent="submit"
          defaultValue={defaultValue}
          onSelect={onPick}
          onInputChange={onText}
        />
      )}
    />
  );
}
