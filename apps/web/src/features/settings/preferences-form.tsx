'use client';

import {
  endpoints,
  localeSchema,
  themeSchema,
  type Locale,
  type Me,
  type Theme,
  type UpdateMeBody,
} from '@heremita/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { LOCALE_NAMES } from '@/i18n/routing';
import { apiFetch } from '@/lib/api/client';
import { queryKeys, viewerQuery } from '@/lib/api/query-keys';
import { loadDocument } from '@/lib/load-document';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { StatusLine, type SaveStatus } from '@/shared/components/status-line/status-line';
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
 * Language and theme, chosen first and saved to the account (E9) with one
 * button: moving through the radios with the arrow keys never saves or
 * leaves the page. On save the theme applies at once (rolled back if the
 * save fails); a new language loads this page again under its prefix.
 */
export function PreferencesForm() {
  const t = useTranslations('settings.preferences');
  const tTheme = useTranslations('common.theme');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: viewer } = useQuery(viewerQuery());
  const languageName = useId();
  const savedTheme = viewer?.theme ?? 'system';
  const [chosenLocale, setChosenLocale] = useState<Locale | null>(null);
  const [chosenTheme, setChosenTheme] = useState<Theme | null>(null);

  const save = useMutation({
    mutationFn: (body: UpdateMeBody) => apiFetch(endpoints.updateMe, { body }),
    onMutate: async ({ theme }) => {
      if (theme === undefined) {
        return undefined;
      }
      // A viewer refetch in flight would land after the optimistic theme and undo it.
      await queryClient.cancelQueries({ queryKey: queryKeys.viewer });
      const previous = queryClient.getQueryData<Me | null>(queryKeys.viewer);
      if (previous) {
        queryClient.setQueryData(queryKeys.viewer, { ...previous, theme });
      }
      applyTheme(theme);
      return previous;
    },
    onError: (_error, { theme }, previous) => {
      const current = queryClient.getQueryData<Me | null>(queryKeys.viewer);
      if (previous && theme !== undefined && current?.theme === theme) {
        queryClient.setQueryData(queryKeys.viewer, previous);
        applyTheme(previous.theme);
      }
    },
    onSuccess: (me, body) => {
      queryClient.setQueryData(queryKeys.viewer, me);
      setChosenTheme(null);
      if (body.locale !== undefined) {
        loadDocument(`${routes.settings(me.locale)}#${PREFERENCES_ANCHOR}`);
        return;
      }
      // The root layout renders `data-theme` from the account on the server.
      router.refresh();
    },
  });

  const shownLocale = chosenLocale ?? locale;
  const shownTheme = chosenTheme ?? savedTheme;
  const leaving = save.isSuccess && save.variables.locale !== undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: UpdateMeBody = {
      ...(shownLocale === locale ? {} : { locale: shownLocale }),
      ...(shownTheme === savedTheme ? {} : { theme: shownTheme }),
    };
    if (Object.keys(body).length > 0) {
      save.mutate(body);
    }
  }

  return (
    <form className={styles.preferences} noValidate onSubmit={submit}>
      {/* Stacked radios, not a segmented control: three language names do not fit side by side on a phone. */}
      <fieldset className={styles.languages} disabled={leaving}>
        <legend className={styles.legend}>{t('language')}</legend>
        {localeSchema.options.map((value) => (
          <label key={value} className={styles.language}>
            <input
              type="radio"
              name={languageName}
              value={value}
              checked={value === shownLocale}
              onChange={() => setChosenLocale(value)}
            />
            <span lang={value}>{LOCALE_NAMES[value]}</span>
          </label>
        ))}
      </fieldset>
      <SegmentedControl
        legend={t('theme')}
        showLegend
        options={themeSchema.options.map((value) => ({ value, label: tTheme(value) }))}
        value={shownTheme}
        onChange={setChosenTheme}
        disabled={leaving}
      />
      {save.isError ? <FormAlert error={save.error} message={t('failed')} /> : null}
      <div className={styles.saveRow}>
        <Button type="submit" variant="primary" busy={save.isPending || leaving}>
          {t('save')}
        </Button>
        <StatusLine status={saveStatus(save)} />
      </div>
    </form>
  );
}
