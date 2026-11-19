import { MyTripsPage } from '@/features/trips/my-trips-page';
import { TripListSkeleton } from '@/features/trips/trip-list-skeleton';
import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

export default function MyTripsLoading() {
  return (
    <>
      <SiteHeader />
      <MyTripsPage>
        <TripListSkeleton />
      </MyTripsPage>
      <SiteFooter />
    </>
  );
}
