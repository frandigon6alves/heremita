import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

/** About: public, with the site header and footer. */
export default function AboutLayout({ children }: LayoutProps<'/[locale]/about'>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
