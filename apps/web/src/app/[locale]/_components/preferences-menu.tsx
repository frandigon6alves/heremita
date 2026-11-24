'use client';

import type { Theme } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { THEMES } from '@heremita/shared/plain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { LOCALE_NAMES, routing } from '@/i18n/routing';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { showToast } from '@/shared/components/toast/toast-store';
import { Check, Languages, Monitor, Moon, Sun } from '@/shared/icons/icons';
import { applyTheme } from '@/shared/theme/theme';
import { useChosenTheme } from '@/shared/theme/use-chosen-theme';
import { useLanguageSwitch } from './language-switcher';
import styles from './preferences-menu.module.css';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/**
 * The app bar's language and theme menu (a native `popover="auto"`): the
 * three languages as links to this page under the other prefix, and the
 * theme as a segmented control that applies at once. A signed-in viewer's
 * choice is saved to the account (E9); an anonymous viewer's theme stays in
 * this browser.
 */
export function PreferencesMenu({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('common.preferences');
  const tTheme = useTranslations('common.theme');
  const popoverId = useId();
  const languageHeadingId = `${popoverId}-language`;
  const { current, hrefFor, follow } = useLanguageSwitch(signedIn);
  const chosenTheme = useChosenTheme();
  const queryClient = useQueryClient();

  const saveTheme = useMutation({
    mutationFn: (theme: Theme) => apiFetch(apiRoutes.updateMe, { body: { theme } }),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.viewer, me),
  });

  function chooseTheme(theme: Theme) {
    const previous = chosenTheme;
    applyTheme(theme);
    if (!signedIn) {
      return;
    }
    saveTheme.mutate(theme, {
      onError: () => {
        applyTheme(previous);
        showToast({ message: t('themeFailed') });
      },
    });
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        popoverTarget={popoverId}
        aria-label={t('menu')}
      >
        <Languages size={24} />
      </button>
      <div id={popoverId} popover="auto" className={styles.popover}>
        <section className={styles.section} aria-labelledby={languageHeadingId}>
          <p id={languageHeadingId} className={styles.heading}>
            {t('language')}
          </p>
          <ul className={styles.languages} role="list">
            {routing.locales.map((locale) => {
              const isCurrent = locale === current;
              return (
                <li key={locale}>
                  <a
                    className={styles.language}
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
        <section className={styles.section}>
          <SegmentedControl
            legend={t('theme')}
            showLegend
            options={THEMES.map((value) => {
              const Icon = THEME_ICONS[value];
              return { value, label: tTheme(value), icon: <Icon size={20} /> };
            })}
            value={chosenTheme}
            onChange={chooseTheme}
          />
        </section>
      </div>
    </>
  );
}
