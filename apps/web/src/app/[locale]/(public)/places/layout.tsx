import { ClientMessages } from '@/i18n/client-messages';
import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

/** Place pages: public, with the site header and footer. */
export default function PlacesLayout({ children }: LayoutProps<'/[locale]/places'>) {
  return (
    <ClientMessages namespaces={['reviews', 'map']}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </ClientMessages>
  );
}
