import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AccountMenu } from '@/features/auth/account-menu';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { AppBar } from '@/shared/components/app-bar/app-bar';
import { BrandMark } from '@/shared/components/brand-mark/brand-mark';
import { Compass, Map } from '@/shared/icons/icons';
import { NavLink } from './nav-link';
import { PreferencesMenu } from './preferences-menu';
import styles from './site-chrome.module.css';

/**
 * Skip link + app bar with the brand and the main navigation for non-planner
 * pages: Explore, then "My trips" and the account menu (name, settings, log
 * out) when signed in or "Log in" / "Sign up" when not, and the language and
 * theme menu last.
 */
export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations('common');
  // Same per-render call as the layout's. API down: the bar renders signed out.
  const viewer = await getViewer().catch(() => null);

  return (
    <>
      <a className={styles.skipLink} href="#main">
        {t('skipToContent')}
      </a>
      <AppBar
        end={
          <nav aria-label={t('nav.label')}>
            <ul className={styles.navList} role="list">
              <li className={styles.optionalOnPhone}>
                <NavLink className={styles.navLink} href={routes.explore(locale)}>
                  <Compass size={20} />
                  <span className={styles.navText}>{t('nav.explore')}</span>
                </NavLink>
              </li>
              {viewer ? (
                <>
                  <li>
                    <NavLink className={styles.navLink} href={routes.trips(locale)}>
                      <Map size={20} />
                      <span className={`${styles.navText} ${styles.navTextPhoneHidden}`}>
                        {t('nav.myTrips')}
                      </span>
                    </NavLink>
                  </li>
                  <li>
                    <AccountMenu
                      displayName={viewer.displayName}
                      moderator={viewer.role === 'moderator'}
                    />
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <NavLink className={styles.navLink} href={routes.login(locale)}>
                      {t('nav.logIn')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink className={styles.navPrimary} href={routes.signup(locale)}>
                      {t('nav.signUp')}
                    </NavLink>
                  </li>
                </>
              )}
              <li>
                <PreferencesMenu signedIn={viewer !== null} />
              </li>
            </ul>
          </nav>
        }
      >
        <Link className={styles.brand} href={routes.landing(locale)} aria-label={t('nav.home')}>
          <BrandMark />
          <span className={styles.brandName}>{t('appName')}</span>
        </Link>
      </AppBar>
    </>
  );
}
