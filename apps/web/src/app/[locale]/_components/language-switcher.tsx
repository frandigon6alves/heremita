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

/**
 * One link per other language, to the same page under that locale prefix,
 * followed with a full page load: the root layout, `<html lang>` and the
 * `NEXT_LOCALE` cookie all change with the locale. A signed-in viewer's
 * account takes the new language first (E9), so what they write next (a
 * review) carries it.
 */
export function LanguageSwitcher({ signedIn }: { signedIn: boolean }) {
  const current = useLocale();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const pathWithQuery = query === '' ? pathname : `${pathname}?${query}`;
  const others = routing.locales.filter((locale): locale is Locale => locale !== current);
  const save = useMutation({
    mutationFn: (locale: Locale) => apiFetch(apiRoutes.updateMe, { body: { locale } }),
  });

  function follow(event: MouseEvent<HTMLAnchorElement>, locale: Locale) {
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
  }

  return (
    <ul className={styles.inlineList} role="list">
      {others.map((locale) => (
        <li key={locale}>
          <a
            className={styles.link}
            href={switchLocalePath(pathWithQuery, locale)}
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
