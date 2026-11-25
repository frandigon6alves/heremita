import { useTranslations } from 'next-intl';
import { ContactSection } from '../../_components/legal/contact-section';
import {
  externalLink,
  LegalList,
  LegalPage,
  LegalSection,
} from '../../_components/legal/legal-page';
import { SERVICE_LINKS } from '../../_components/legal/service-links';

/** What Heremita is, the credits its data sources and services require, and the operator contact. */
export function AboutContent({ contactEmail }: { contactEmail: string | null }) {
  const t = useTranslations('legal.about');

  return (
    <LegalPage title={t('title')} lead={t('lead')}>
      <LegalSection heading={t('credits.heading')}>
        <p>{t('credits.intro')}</p>
        <LegalList>
          <li>
            {t.rich('credits.osm', {
              link: externalLink(SERVICE_LINKS.osmCopyright),
              fix: externalLink(SERVICE_LINKS.fixTheMap),
            })}
          </li>
          <li>
            {t.rich('credits.tiles', {
              link: externalLink(SERVICE_LINKS.openFreeMap),
              fallback: externalLink(SERVICE_LINKS.versaTiles),
            })}
          </li>
          <li>{t.rich('credits.routing', { link: externalLink(SERVICE_LINKS.osrm) })}</li>
          <li>{t.rich('credits.search', { link: externalLink(SERVICE_LINKS.photon) })}</li>
          <li>{t.rich('credits.nominatim', { link: externalLink(SERVICE_LINKS.nominatim) })}</li>
          <li>{t.rich('credits.icons', { link: externalLink(SERVICE_LINKS.lucide) })}</li>
        </LegalList>
      </LegalSection>
      <ContactSection email={contactEmail} />
    </LegalPage>
  );
}
