import { MyTripsPage } from '@/features/trips/my-trips-page';
import { TripListSkeleton } from '@/features/trips/trip-list-skeleton';

export default function MyTripsLoading() {
  return (
    <MyTripsPage>
      <TripListSkeleton />
    </MyTripsPage>
  );
}
