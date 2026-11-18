import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { LanguageSwitcher } from './language-switcher';
import styles from './site-chrome.module.css';

/** Secondary links and the language switcher, at the end of non-planner pages. */
export async function SiteFooter() {
  const locale = await getLocale();
  const t = await getTranslations('common');

  return (
    <footer className={styles.footer}>
      <nav aria-label={t('footer.label')}>
        <ul className={styles.inlineList} role="list">
          <li>
            <Link className={styles.link} href={routes.explore(locale)}>
              {t('nav.explore')}
            </Link>
          </li>
          <li>
            <Link className={styles.link} href={routes.about(locale)}>
              {t('footer.about')}
            </Link>
          </li>
          <li>
            <Link className={styles.link} href={routes.privacy(locale)}>
              {t('footer.privacy')}
            </Link>
          </li>
        </ul>
      </nav>
      <div className={styles.language}>
        <span className={styles.languageLabel}>{t('footer.language')}</span>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
