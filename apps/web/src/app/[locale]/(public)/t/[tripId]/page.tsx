import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ClientMessages } from '@/i18n/client-messages';
import { routing } from '@/i18n/routing';
import { loadPlan } from '@/features/itinerary/load-plan';
import { planQueryFrom, preconnectBasemap } from '@/features/itinerary/page-setup';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { PublicTripViewer } from '../_components/trip-viewer-screen';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/t/[tripId]'>): Promise<Metadata> {
  const { tripId } = await params;
  const { plan } = await loadPlan(tripId);
  return {
    title: plan.trip.title,
    description: plan.trip.description ?? undefined,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, routes.publicTrip(locale, tripId)]),
      ),
    },
  };
}

/** A public trip, read-only (E24 viewer shape). Its owner is sent to the planner. */
export default async function PublicTripPage({
  params,
  searchParams,
}: PageProps<'/[locale]/t/[tripId]'>) {
  const { tripId } = await params;
  const locale = await getLocale();
  const query = planQueryFrom(await searchParams);
  const [{ plan, fetchedAt }, viewer] = await Promise.all([
    loadPlan(tripId),
    getViewer().catch(() => null),
  ]);
  if (plan.viewerRole === 'owner') {
    redirect(routes.planner(locale, tripId, query));
  }
  preconnectBasemap();
  return (
    <ClientMessages namespaces={['itinerary', 'map', 'reviews', 'trips']}>
      <main id="main">
        <NuqsAdapter>
          <PublicTripViewer
            tripId={tripId}
            initialPlan={plan}
            initialUpdatedAt={fetchedAt}
            signedIn={viewer !== null}
            path={routes.publicTrip(locale, tripId, query)}
          />
        </NuqsAdapter>
      </main>
    </ClientMessages>
  );
}
