import { LIMITS } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import Form from 'next/form';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { TextField } from '@/shared/components/text-field/text-field';
import { Search } from '@/shared/icons/icons';
import styles from './explore-search.module.css';

/**
 * Search of public trips by title or destination: a GET form to `?q=`, so it
 * works before JavaScript loads; afterwards it navigates without a reload
 * and replaces the history entry.
 */
export function ExploreSearch({ q }: { q: string }) {
  const t = useTranslations('explore.search');
  const locale = useLocale();

  return (
    <Form action={routes.explore(locale)} replace className={styles.search} role="search">
      <TextField
        label={t('label')}
        name="q"
        type="search"
        defaultValue={q}
        maxLength={LIMITS.PUBLIC_TRIPS_Q_MAX}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" variant="primary">
        <Search size={20} />
        {t('submit')}
      </Button>
    </Form>
  );
}
