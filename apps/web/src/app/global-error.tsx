'use client';

import { DEFAULT_LOCALE, isOneOf, LOCALES } from '@heremita/shared/plain';
import { usePathname } from 'next/navigation';
import { buttonClassName } from '@/shared/components/button/button-class';
import styles from './[locale]/_components/status-page.module.css';
import { GLOBAL_ERROR_TEXT } from './global-error-text';
import '@/shared/styles/tokens.css';
import '@/shared/styles/reset.css';
import '@/shared/styles/base.css';

/**
 * Replaces the root layout when it fails, so no providers, fonts or theme
 * script are available: the locale comes from the URL and the text from the
 * copied common strings (`global-error-text.ts`). Colours follow the OS (no data-theme).
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const firstSegment = usePathname().split('/')[1];
  const locale = isOneOf(LOCALES, firstSegment) ? firstSegment : DEFAULT_LOCALE;
  const t = GLOBAL_ERROR_TEXT[locale];

  return (
    <html lang={locale}>
      <body>
        <title>{t.title}</title>
        <main id="main" className={styles.main}>
          <div className={styles.content}>
            <h1>{t.title}</h1>
            <p className={styles.body}>{t.body}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={buttonClassName({ variant: 'primary', size: 'large' })}
                onClick={() => retry()}
              >
                {t.retry}
              </button>
              <a
                className={buttonClassName({ variant: 'ghost', size: 'large' })}
                href={`/${locale}`}
              >
                {t.home}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
