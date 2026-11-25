import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ClientMessages } from '@/i18n/client-messages';
import { loadSharedPlan } from '@/features/itinerary/load-plan';
import { planQueryFrom, preconnectBasemap } from '@/features/itinerary/page-setup';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { SharedTripViewer } from '../../_components/trip-viewer/trip-viewer-screen';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/s/[shareToken]'>): Promise<Metadata> {
  const { shareToken } = await params;
  const { plan } = await loadSharedPlan(shareToken);
  // A share link is for the people it was sent to: never indexed.
  return { title: plan.trip.title, robots: { index: false, follow: false } };
}

/** A trip opened by its share link (E26): read-only, even for its owner. */
export default async function SharedTripPage({
  params,
  searchParams,
}: PageProps<'/[locale]/s/[shareToken]'>) {
  const { shareToken } = await params;
  const locale = await getLocale();
  const [{ plan, fetchedAt }, viewer] = await Promise.all([
    loadSharedPlan(shareToken),
    getViewer().catch(() => null),
  ]);
  preconnectBasemap();
  return (
    <ClientMessages namespaces={['itinerary', 'map', 'reviews', 'trips']}>
      <main id="main">
        <NuqsAdapter>
          <SharedTripViewer
            shareToken={shareToken}
            initialPlan={plan}
            initialUpdatedAt={fetchedAt}
            signedIn={viewer !== null}
            path={routes.sharedTrip(locale, shareToken, planQueryFrom(await searchParams))}
          />
        </NuqsAdapter>
      </main>
    </ClientMessages>
  );
}
