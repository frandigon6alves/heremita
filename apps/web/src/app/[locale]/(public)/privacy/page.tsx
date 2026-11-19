import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/env';
import { routing } from '@/i18n/routing';
import { routes } from '@/lib/routes';
import { PrivacyContent } from './_components/privacy-content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacy');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, routes.privacy(locale)]),
      ),
    },
  };
}

/** Static privacy policy: what is stored, which services receive what, deletion, contact. */
export default function PrivacyPage() {
  return <PrivacyContent contactEmail={env.CONTACT_EMAIL} />;
}
