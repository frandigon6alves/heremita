import { ClientMessages } from '@/i18n/client-messages';

/** Trip settings: members only (the `(app)` gate). */
export default function TripSettingsLayout({
  children,
}: LayoutProps<'/[locale]/trips/[tripId]/settings'>) {
  return <ClientMessages namespaces={['trips', 'place-search']}>{children}</ClientMessages>;
}
