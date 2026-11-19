import { ClientMessages } from '@/i18n/client-messages';
import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

export default function ModerationLayout({ children }: LayoutProps<'/[locale]/moderation'>) {
  return (
    <ClientMessages namespaces={['reviews']}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </ClientMessages>
  );
}
