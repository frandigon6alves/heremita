import { ClientMessages } from '@/i18n/client-messages';
import { SiteFooter } from '../../../../_components/site-footer';
import { SiteHeader } from '../../../../_components/site-header';

/** Trip settings: members only (the `(app)` gate), with the site header and footer. */
export default function TripSettingsLayout({
  children,
}: LayoutProps<'/[locale]/trips/[tripId]/settings'>) {
  return (
    <ClientMessages namespaces={['trips', 'place-search']}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </ClientMessages>
  );
}
