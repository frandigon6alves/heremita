import { ClientMessages } from '@/i18n/client-messages';

/** Place pages: public. */
export default function PlacesLayout({ children }: LayoutProps<'/[locale]/places'>) {
  return <ClientMessages namespaces={['reviews', 'map']}>{children}</ClientMessages>;
}
