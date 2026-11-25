import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AccountMenu } from '@/features/auth/account-menu';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { AppBar } from '@/shared/components/app-bar/app-bar';
import { BrandMark } from '@/shared/components/brand-mark/brand-mark';
import { Compass, Map } from '@/shared/icons/icons';
import { NavLink } from './nav-link';
import { LanguageMenu, MobileMenu, ThemeMenu } from './header-menus';
import styles from './site-chrome.module.css';

/**
 * Skip link + app bar with the brand and the main navigation for non-planner
 * pages. From 768 px: Explore, then "My trips" and the account menu (name,
 * settings, log out) when signed in or "Log in" / "Sign up" when not, then a
 * language menu and a theme menu. On phones all of it sits in one menu behind
 * a gear. Both are in the HTML; CSS shows one (no width detection in JS).
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
          <>
            <nav className={styles.desktopNav} aria-label={t('nav.label')}>
              <ul className={styles.navList} role="list">
                <li>
                  <NavLink className={styles.navLink} href={routes.explore(locale)}>
                    <Compass size={20} />
                    {t('nav.explore')}
                  </NavLink>
                </li>
                {viewer ? (
                  <>
                    <li>
                      <NavLink className={styles.navLink} href={routes.trips(locale)}>
                        <Map size={20} />
                        {t('nav.myTrips')}
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
                  <LanguageMenu signedIn={viewer !== null} />
                </li>
                <li>
                  <ThemeMenu signedIn={viewer !== null} />
                </li>
              </ul>
            </nav>
            <nav className={styles.mobileNav} aria-label={t('nav.label')}>
              <MobileMenu
                viewer={
                  viewer
                    ? { displayName: viewer.displayName, moderator: viewer.role === 'moderator' }
                    : null
                }
              />
            </nav>
          </>
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
