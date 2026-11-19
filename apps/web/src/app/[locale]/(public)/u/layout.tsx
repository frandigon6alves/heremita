import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

/** Public profiles: with the site header and footer. */
export default function ProfilesLayout({ children }: LayoutProps<'/[locale]/u'>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
