import { ClientMessages } from '@/i18n/client-messages';

/** Review form pages: members only (the `(app)` gate). */
export default function PlaceReviewLayout({ children }: LayoutProps<'/[locale]/places'>) {
  return <ClientMessages namespaces={['reviews']}>{children}</ClientMessages>;
}
