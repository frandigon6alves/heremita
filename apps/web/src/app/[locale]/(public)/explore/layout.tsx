import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

/** Explore: public, with the site header and footer. */
export default function ExploreLayout({ children }: LayoutProps<'/[locale]/explore'>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
