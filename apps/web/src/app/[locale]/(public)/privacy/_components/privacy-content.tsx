import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { ContactSection } from '../../_components/legal/contact-section';
import {
  externalLink,
  LegalList,
  LegalPage,
  LegalSection,
} from '../../_components/legal/legal-page';
import { SERVICE_LINKS } from '../../_components/legal/service-links';

/** What Heremita stores, who receives queries and coordinates, browser storage, deletion, contact. */
export function PrivacyContent({ contactEmail }: { contactEmail: string | null }) {
  const t = useTranslations('legal.privacy');
  const locale = useLocale();

  return (
    <LegalPage title={t('title')} lead={t('lead')}>
      <LegalSection heading={t('stored.heading')}>
        <LegalList>
          <li>{t('stored.account')}</li>
          <li>{t('stored.sessions')}</li>
          <li>{t('stored.trips')}</li>
          <li>{t('stored.notes')}</li>
          <li>{t('stored.reviews')}</li>
          <li>{t('stored.reports')}</li>
        </LegalList>
      </LegalSection>
      <LegalSection heading={t('recipients.heading')}>
        <p>{t('recipients.intro')}</p>
        <LegalList>
          <li>{t.rich('recipients.search', { link: externalLink(SERVICE_LINKS.photon) })}</li>
          <li>{t.rich('recipients.nominatim', { link: externalLink(SERVICE_LINKS.nominatim) })}</li>
          <li>
            {t.rich('recipients.routing', { link: externalLink(SERVICE_LINKS.fossgisRouting) })}
          </li>
          <li>
            {t.rich('recipients.tiles', {
              link: externalLink(SERVICE_LINKS.openFreeMap),
              fallback: externalLink(SERVICE_LINKS.versaTiles),
            })}
          </li>
          <li>{t('recipients.handoff')}</li>
          <li>{t('recipients.location')}</li>
        </LegalList>
      </LegalSection>
      <LegalSection heading={t('browser.heading')}>
        <p>{t('browser.intro')}</p>
        <LegalList>
          <li>{t('browser.session')}</li>
          <li>{t('browser.language')}</li>
          <li>{t('browser.theme')}</li>
          <li>{t('browser.drafts')}</li>
        </LegalList>
      </LegalSection>
      <LegalSection heading={t('logs.heading')}>
        <p>{t('logs.body')}</p>
      </LegalSection>
      <LegalSection heading={t('deletion.heading')}>
        <p>
          {t.rich('deletion.body', {
            link: (chunks) => <Link href={`${routes.settings(locale)}#account`}>{chunks}</Link>,
          })}
        </p>
      </LegalSection>
      <ContactSection email={contactEmail} />
    </LegalPage>
  );
}
