import { ClientMessages } from '@/i18n/client-messages';

/** Public profiles. */
export default function ProfilesLayout({ children }: LayoutProps<'/[locale]/u'>) {
  return <ClientMessages namespaces={['explore']}>{children}</ClientMessages>;
}
