import { ClientMessages } from '@/i18n/client-messages';
import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

/** Public profiles: with the site header and footer. */
export default function ProfilesLayout({ children }: LayoutProps<'/[locale]/u'>) {
  return (
    <ClientMessages namespaces={['explore']}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </ClientMessages>
  );
}
