'use client';

import { PlaceSearch } from '@/features/place-search';
import { TripForm } from '@/features/trips/trip-form';

/** The create form with the place search as its destination field. */
export function NewTripForm() {
  return (
    <TripForm
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
