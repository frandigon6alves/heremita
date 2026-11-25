'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { LOCALE_NAMES, routing } from '@/i18n/routing';
import { Check } from '@/shared/icons/icons';
import { useLanguageSwitch } from './language-switcher';
import styles from './header-menus.module.css';

/**
 * The three languages as links to this page under the other prefix. A
 * signed-in viewer's choice is saved to the account (E9) before leaving.
 */
export function LanguageOptions({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('common.preferences');
  const headingId = useId();
  const { current, hrefFor, follow } = useLanguageSwitch(signedIn);

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <p id={headingId} className={styles.heading}>
        {t('language')}
      </p>
      <ul className={styles.items} role="list">
        {routing.locales.map((locale) => {
          const isCurrent = locale === current;
          return (
            <li key={locale}>
              <a
                className={styles.item}
                href={hrefFor(locale)}
                hrefLang={locale}
                lang={locale}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={(event) => follow(event, locale)}
              >
                <span className={styles.check}>{isCurrent ? <Check size={20} /> : null}</span>
                {LOCALE_NAMES[locale]}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
