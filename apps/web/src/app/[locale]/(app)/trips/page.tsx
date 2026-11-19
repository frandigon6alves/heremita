import { apiRoutes } from '@heremita/shared/api-routes';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientMessages } from '@/i18n/client-messages';
import { MyTripsPage } from '@/features/trips/my-trips-page';
import { TripList } from '@/features/trips/trip-list';
import { WarmMapChunk } from '@/features/trips/warm-map-chunk';
import { serverFetch } from '@/lib/api/server';
import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trips.mine');
  return { title: t('metaTitle') };
}

/** My trips: first page of E18 rendered here; "Load more" and retries run in the browser. */
export default async function MyTripsRoute() {
  // A failed first page is not fatal: the list fetches it again and shows its own error state.
  const firstPage = await serverFetch(apiRoutes.listMyTrips).catch(() => undefined);

  return (
    <ClientMessages namespaces={['trips', 'map']}>
      <SiteHeader />
      <MyTripsPage>
        <TripList initialPage={firstPage} />
        <WarmMapChunk />
      </MyTripsPage>
      <SiteFooter />
    </ClientMessages>
  );
}
