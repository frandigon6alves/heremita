import { ClientMessages } from '@/i18n/client-messages';

export default function ModerationLayout({ children }: LayoutProps<'/[locale]/moderation'>) {
  return <ClientMessages namespaces={['reviews']}>{children}</ClientMessages>;
}
