import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { BrandMark } from '@/shared/components/brand-mark/brand-mark';
import { Compass, Info, Languages, ShieldCheck } from '@/shared/icons/icons';
import { LanguageSwitcher } from './language-switcher';
import styles from './site-chrome.module.css';

/** Brand and tagline, secondary links and the language switcher, at the end of non-planner pages. */
export async function SiteFooter() {
  const locale = await getLocale();
  const t = await getTranslations('common');
  // API trouble while reading the session: the links still switch the page's language.
  const viewer = await getViewer().catch(() => null);

  return (
    <footer className={styles.footer}>
      <div className={styles.footerBrand}>
        <span className={styles.footerBrandName}>
          <BrandMark />
          {t('appName')}
        </span>
        <p className={styles.tagline}>{t('meta.description')}</p>
      </div>
      <nav aria-label={t('footer.label')}>
        <ul className={styles.inlineList} role="list">
          <li>
            <Link className={styles.link} href={routes.explore(locale)}>
              <Compass size={20} />
              {t('nav.explore')}
            </Link>
          </li>
          <li>
            <Link className={styles.link} href={routes.about(locale)}>
              <Info size={20} />
              {t('footer.about')}
            </Link>
          </li>
          <li>
            <Link className={styles.link} href={routes.privacy(locale)}>
              <ShieldCheck size={20} />
              {t('footer.privacy')}
            </Link>
          </li>
        </ul>
      </nav>
      <div className={styles.language}>
        <span className={styles.languageLabel}>
          <Languages size={20} />
          {t('footer.language')}
        </span>
        <LanguageSwitcher signedIn={viewer !== null} />
      </div>
    </footer>
  );
}
