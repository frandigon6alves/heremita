import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

/** Privacy: public, with the site header and footer. */
export default function PrivacyLayout({ children }: LayoutProps<'/[locale]/privacy'>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
