'use client';

import { TripForm } from '@/features/trips/trip-form';
import { DestinationSearch } from '../../_components/destination-search';

/** The create form with the place search as its destination field. */
export function NewTripForm() {
  return <TripForm renderDestination={(picker) => <DestinationSearch {...picker} />} />;
}
