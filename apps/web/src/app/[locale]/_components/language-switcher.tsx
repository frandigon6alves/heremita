'use client';

import type { Locale } from '@heremita/shared';
import { useLocale } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { LOCALE_NAMES, routing } from '@/i18n/routing';
import { switchLocalePath } from '@/lib/routes';
import styles from './site-chrome.module.css';

/**
 * One link per other language, to the same page under that locale prefix. A
 * plain link (full page load): the root layout, `<html lang>` and the
 * `NEXT_LOCALE` cookie all change with the locale.
 */
export function LanguageSwitcher() {
  const current = useLocale();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const pathWithQuery = query === '' ? pathname : `${pathname}?${query}`;
  const others = routing.locales.filter((locale): locale is Locale => locale !== current);

  return (
    <ul className={styles.inlineList} role="list">
      {others.map((locale) => (
        <li key={locale}>
          <a
            className={styles.link}
            href={switchLocalePath(pathWithQuery, locale)}
            hrefLang={locale}
            lang={locale}
          >
            {LOCALE_NAMES[locale]}
          </a>
        </li>
      ))}
    </ul>
  );
}
