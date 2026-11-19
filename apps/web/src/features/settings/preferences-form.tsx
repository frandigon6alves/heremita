'use client';

import {
  endpoints,
  localeSchema,
  themeSchema,
  type Locale,
  type Me,
  type Theme,
} from '@heremita/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALE_NAMES } from '@/i18n/routing';
import { apiFetch } from '@/lib/api/client';
import { queryKeys, viewerQuery } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { StatusLine, type SaveStatus } from '@/shared/components/status-line/status-line';
import { showToast } from '@/shared/components/toast/toast-store';
import { applyTheme } from '@/shared/theme/theme';
import { PREFERENCES_ANCHOR } from './sections';
import styles from './settings.module.css';

function saveStatus(mutation: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}): SaveStatus {
  if (mutation.isPending) {
    return 'saving';
  }
  if (mutation.isError) {
    return 'error';
  }
  return mutation.isSuccess ? 'saved' : 'idle';
}

/**
 * Language and theme, each saved to the account (E9) as soon as it changes.
 * The theme applies at once and rolls back if the save fails. The language is
 * the URL's: once saved, the page loads again under the new locale prefix.
 */
export function PreferencesForm() {
  const t = useTranslations('settings.preferences');
  const tTheme = useTranslations('common.theme');
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: viewer } = useQuery(viewerQuery());
  const languageName = useId();

  const theme = useMutation({
    mutationFn: (value: Theme) => apiFetch(endpoints.updateMe, { body: { theme: value } }),
    onMutate: async (value) => {
      // A viewer refetch in flight would land after the optimistic theme and undo it.
      await queryClient.cancelQueries({ queryKey: queryKeys.viewer });
      const previous = queryClient.getQueryData<Me | null>(queryKeys.viewer);
      if (previous) {
        queryClient.setQueryData(queryKeys.viewer, { ...previous, theme: value });
      }
      applyTheme(value);
      return previous;
    },
    onError: (_error, value, previous) => {
      // A later choice made meanwhile stays: only this save's own change is undone.
      const current = queryClient.getQueryData<Me | null>(queryKeys.viewer);
      if (previous && current?.theme === value) {
        queryClient.setQueryData(queryKeys.viewer, previous);
        applyTheme(previous.theme);
      }
      showToast({
        message: t('themeNotSaved'),
        action: { label: tActions('retry'), onAction: () => theme.mutate(value) },
      });
    },
    onSuccess: (me) => {
      queryClient.setQueryData(queryKeys.viewer, me);
      // The root layout renders `data-theme` from the account on the server.
      router.refresh();
    },
  });

  const language = useMutation({
    mutationFn: (value: Locale) => apiFetch(endpoints.updateMe, { body: { locale: value } }),
    onSuccess: (me) => {
      // Lands on this page in the new language, back at this section.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load on purpose, like the language switcher: `<html lang>`, the messages and the locale cookie all change
      window.location.assign(`${routes.settings(me.locale)}#${PREFERENCES_ANCHOR}`);
    },
    onError: (_error, value) => {
      showToast({
        message: t('languageNotSaved'),
        action: { label: tActions('retry'), onAction: () => language.mutate(value) },
      });
    },
  });

  const shownLocale = language.isIdle || language.isError ? locale : (language.variables ?? locale);

  return (
    <div className={styles.preferences}>
      <div className={styles.preference}>
        {/* Stacked radios, not a segmented control: three language names do not fit side by side on a phone. */}
        <fieldset className={styles.languages} disabled={language.isPending || language.isSuccess}>
          <legend className={styles.legend}>{t('language')}</legend>
          {localeSchema.options.map((value) => (
            <label key={value} className={styles.language}>
              <input
                type="radio"
                name={languageName}
                value={value}
                checked={value === shownLocale}
                onChange={() => language.mutate(value)}
              />
              <span lang={value}>{LOCALE_NAMES[value]}</span>
            </label>
          ))}
        </fieldset>
        <StatusLine status={saveStatus(language)} />
      </div>
      <div className={styles.preference}>
        <SegmentedControl
          legend={t('theme')}
          showLegend
          options={themeSchema.options.map((value) => ({ value, label: tTheme(value) }))}
          value={viewer?.theme ?? 'system'}
          onChange={(value) => theme.mutate(value)}
        />
        <StatusLine status={saveStatus(theme)} />
      </div>
    </div>
  );
}
