import { ClientMessages } from '@/i18n/client-messages';

/** Explore: public. */
export default function ExploreLayout({ children }: LayoutProps<'/[locale]/explore'>) {
  return <ClientMessages namespaces={['explore']}>{children}</ClientMessages>;
}
