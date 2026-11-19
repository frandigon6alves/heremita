import { SiteFooter } from '../../_components/site-footer';
import { SiteHeader } from '../../_components/site-header';

/** Review form pages: members only (the `(app)` gate), with the site header and footer. */
export default function PlaceReviewLayout({ children }: LayoutProps<'/[locale]/places'>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
