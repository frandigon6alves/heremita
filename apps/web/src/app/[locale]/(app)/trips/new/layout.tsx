import { ClientMessages } from '@/i18n/client-messages';
import { SiteFooter } from '../../../_components/site-footer';
import { SiteHeader } from '../../../_components/site-header';

/** Create-trip page: members only (the `(app)` gate), with the site header and footer. */
export default function NewTripLayout({ children }: LayoutProps<'/[locale]/trips/new'>) {
  return (
    <ClientMessages namespaces={['trips', 'place-search']}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </ClientMessages>
  );
}
