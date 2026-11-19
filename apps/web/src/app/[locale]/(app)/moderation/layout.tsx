import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

export default function ModerationLayout({ children }: LayoutProps<'/[locale]/moderation'>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
