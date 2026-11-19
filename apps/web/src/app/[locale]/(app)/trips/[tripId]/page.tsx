import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ClientMessages } from '@/i18n/client-messages';
import { loadPlan } from '@/features/itinerary/load-plan';
import { planQueryFrom, preconnectBasemap } from '@/features/itinerary/page-setup';
import { routes } from '@/lib/routes';
import { PlannerScreen } from './_components/planner-screen';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/trips/[tripId]'>): Promise<Metadata> {
  const { tripId } = await params;
  const { plan } = await loadPlan(tripId);
  return { title: plan.trip.title };
}

/** The planner (E24, owner). Someone else's public trip opens read-only on `/t`. */
export default async function PlannerPage({
  params,
  searchParams,
}: PageProps<'/[locale]/trips/[tripId]'>) {
  const { tripId } = await params;
  const { plan, fetchedAt } = await loadPlan(tripId);
  if (plan.viewerRole !== 'owner') {
    redirect(routes.publicTrip(await getLocale(), tripId, planQueryFrom(await searchParams)));
  }
  preconnectBasemap();
  return (
    <ClientMessages namespaces={['itinerary', 'map', 'place-search', 'reviews']}>
      <main id="main">
        <NuqsAdapter>
          <PlannerScreen tripId={tripId} initialPlan={plan} initialUpdatedAt={fetchedAt} />
        </NuqsAdapter>
      </main>
    </ClientMessages>
  );
}
