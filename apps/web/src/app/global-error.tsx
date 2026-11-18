'use client';

import { localeSchema } from '@heremita/shared';
import { usePathname } from 'next/navigation';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import en from '@/messages/en/common.json';
import ptBR from '@/messages/pt-BR/common.json';
import styles from './[locale]/_components/status-page.module.css';
import '@/shared/styles/tokens.css';
import '@/shared/styles/reset.css';
import '@/shared/styles/base.css';

const COMMON = { en, 'pt-BR': ptBR } as const;

/**
 * Replaces the root layout when it fails, so no providers, fonts or theme
 * script are available: the locale comes from the URL and the text from the
 * bundled common catalogue. Colours follow the OS (no data-theme).
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const firstSegment = usePathname().split('/')[1];
  const parsed = localeSchema.safeParse(firstSegment);
  const locale = parsed.success ? parsed.data : DEFAULT_LOCALE;
  const t = COMMON[locale];

  return (
    <html lang={locale}>
      <body>
        <title>{t.error.title}</title>
        <main id="main" className={styles.main}>
          <div className={styles.content}>
            <h1>{t.error.title}</h1>
            <p className={styles.body}>{t.error.body}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryAction} onClick={() => retry()}>
                {t.actions.retry}
              </button>
              <a className={styles.secondaryAction} href={`/${locale}`}>
                {t.notFound.home}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
