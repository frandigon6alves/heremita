import { apiRoutes } from '@heremita/shared/api-routes';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Landing } from '@/features/explore/landing';
import { getViewer, serverFetch } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '../_components/site-footer';
import { SiteHeader } from '../_components/site-header';

/** Public trips in the landing's community strip. */
const COMMUNITY_STRIP_SIZE = 6;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('explore.landing');
  return {
    description: t('metaDescription'),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, routes.landing(locale)]),
      ),
    },
  };
}

/** Start page: what Heremita does, the call to action, newest public trips (E48). */
export default async function LandingPage() {
  const [viewer, community] = await Promise.all([
    getViewer().catch(() => null),
    // A marketing page never shows an error panel: no trips (or no answer) hides the strip.
    serverFetch(apiRoutes.listPublicTrips, { query: { limit: COMMUNITY_STRIP_SIZE } }).catch(
      () => null,
    ),
  ]);

  return (
    <>
      <SiteHeader />
      <Landing signedIn={viewer !== null} communityTrips={community?.items ?? []} />
      <SiteFooter />
    </>
  );
}
