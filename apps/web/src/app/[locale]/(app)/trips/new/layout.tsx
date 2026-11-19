import { ClientMessages } from '@/i18n/client-messages';

/** Create-trip page: members only (the `(app)` gate). */
export default function NewTripLayout({ children }: LayoutProps<'/[locale]/trips/new'>) {
  return <ClientMessages namespaces={['trips', 'place-search']}>{children}</ClientMessages>;
}
