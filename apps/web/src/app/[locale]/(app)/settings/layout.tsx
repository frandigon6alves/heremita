import { ClientMessages } from '@/i18n/client-messages';
import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

export default function SettingsLayout({ children }: LayoutProps<'/[locale]/settings'>) {
  return (
    <ClientMessages namespaces={['settings']}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </ClientMessages>
  );
}
