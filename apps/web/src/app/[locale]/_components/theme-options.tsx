'use client';

import type { Theme } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { THEMES } from '@heremita/shared/plain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { showToast } from '@/shared/components/toast/toast-store';
import { applyTheme } from '@/shared/theme/theme';
import { useChosenTheme } from '@/shared/theme/use-chosen-theme';
import styles from './header-menus.module.css';
import { THEME_ICONS } from './theme-icons';

/**
 * The theme as a segmented control that applies at once. A signed-in
 * viewer's choice is saved to the account (E9, rolled back with a toast if
 * refused); an anonymous viewer's stays in this browser.
 */
export function ThemeOptions({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('common.preferences');
  const tTheme = useTranslations('common.theme');
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
  );
}
