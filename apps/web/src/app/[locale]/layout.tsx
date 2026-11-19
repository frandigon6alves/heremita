import type { Metadata, Viewport } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { NONCE_HEADER } from '@/csp';
import { ClientMessages } from '@/i18n/client-messages';
import { routing } from '@/i18n/routing';
import { getViewer } from '@/lib/api/server';
import { OfflineStatus } from '@/shared/components/offline-banner/offline-status';
import { Toaster } from '@/shared/components/toast/toaster';
import { atkinson, fraunces } from '@/shared/styles/fonts';
import { THEME_SCRIPT } from '@/shared/theme/theme';
import { Providers } from './_components/providers';
import '@/shared/styles/tokens.css';
import '@/shared/styles/reset.css';
import '@/shared/styles/base.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return {
    title: { default: t('appName'), template: `%s · ${t('appName')}` },
    description: t('meta.description'),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5efe3' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1619' },
  ],
};

export default async function LocaleLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Reading the request also keeps every page dynamic, which a per-request nonce needs.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  // Only the theme depends on it here: if the API is down the page still
  // renders (anonymous theme), and the page's own data shows the error.
  const viewer = await getViewer().catch(() => null);

  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${atkinson.variable}`}
      // Signed in: the account's theme ("system" too, so the anonymous
      // override in this browser does not apply). Signed out: the theme
      // script may set it before React hydrates.
      data-theme={viewer?.theme}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          // Browsers hide the nonce attribute from the DOM after parsing.
          suppressHydrationWarning
          // eslint-disable-next-line react/no-danger -- constant source code, no user input; must run before first paint
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body>
        <ClientMessages namespaces={[]}>
          <Providers>
            <OfflineStatus />
            {children}
            <Toaster />
          </Providers>
        </ClientMessages>
      </body>
    </html>
  );
}
