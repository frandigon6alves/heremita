'use client';

import type { TripOwner } from '@heremita/shared';
import { TripSettings } from '@/features/trips/trip-settings';
import { DestinationSearch } from '../../../_components/destination-search';

/** Trip settings with the place search as the destination field. */
export function TripSettingsScreen({ trip }: { trip: TripOwner }) {
  return (
    <TripSettings
      initialTrip={trip}
      renderDestination={(picker) => <DestinationSearch {...picker} />}
    />
  );
}
