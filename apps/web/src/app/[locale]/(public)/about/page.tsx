import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/env';
import { routing } from '@/i18n/routing';
import { routes } from '@/lib/routes';
import { AboutContent } from './_components/about-content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.about');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, routes.about(locale)]),
      ),
    },
  };
}

/** Static About page; providers' User-Agent points here, so it carries the operator contact. */
export default function AboutPage() {
  return <AboutContent contactEmail={env.CONTACT_EMAIL} />;
}
