import { ClientMessages } from '@/i18n/client-messages';

export default function SettingsLayout({ children }: LayoutProps<'/[locale]/settings'>) {
  return <ClientMessages namespaces={['settings']}>{children}</ClientMessages>;
}
