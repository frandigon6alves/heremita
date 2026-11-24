'use client';

import type { Locale } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { useMutation } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import type { MouseEvent } from 'react';
import { LOCALE_NAMES, routing } from '@/i18n/routing';
import { apiFetch } from '@/lib/api/client';
import { loadDocument } from '@/lib/load-document';
import { switchLocalePath } from '@/lib/routes';
import styles from './site-chrome.module.css';

/** A click that opens the link elsewhere (new tab or window) leaves this page alone. */
function opensElsewhere(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export interface LanguageSwitch {
  current: Locale;
  /** The same page (path and query) under `locale`'s prefix. */
  hrefFor: (locale: Locale) => string;
  /**
   * Click handler of a language link: a signed-in viewer's account takes
   * the new language first (E9), so what they write next (a review) carries
   * it; then the page loads again under the new prefix (`<html lang>`, the
   * messages and the `NEXT_LOCALE` cookie all change with it).
   */
  follow: (event: MouseEvent<HTMLAnchorElement>, locale: Locale) => void;
}

/** What every language switcher (footer list, header menu) needs to offer the other languages. */
export function useLanguageSwitch(signedIn: boolean): LanguageSwitch {
  const current = useLocale();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const pathWithQuery = query === '' ? pathname : `${pathname}?${query}`;
  const save = useMutation({
    mutationFn: (locale: Locale) => apiFetch(apiRoutes.updateMe, { body: { locale } }),
  });

  return {
    current,
    hrefFor: (locale) => switchLocalePath(pathWithQuery, locale),
    follow: (event, locale) => {
      if (!signedIn || opensElsewhere(event)) {
        return;
      }
      event.preventDefault();
      if (save.isPending) {
        return;
      }
      const href = event.currentTarget.href;
      // The page in the other language matters more than the saved preference: leave either way.
      save.mutate(locale, { onSettled: () => loadDocument(href) });
    },
  };
}

/** One link per other language, for the footer. */
export function LanguageSwitcher({ signedIn }: { signedIn: boolean }) {
  const { current, hrefFor, follow } = useLanguageSwitch(signedIn);
  const others = routing.locales.filter((locale): locale is Locale => locale !== current);

  return (
    <ul className={styles.inlineList} role="list">
      {others.map((locale) => (
        <li key={locale}>
          <a
            className={styles.link}
            href={hrefFor(locale)}
            hrefLang={locale}
            lang={locale}
            onClick={(event) => follow(event, locale)}
          >
            {LOCALE_NAMES[locale]}
          </a>
        </li>
      ))}
    </ul>
  );
}
