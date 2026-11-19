import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AccountMenu } from '@/features/auth/account-menu';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import { AppBar } from '@/shared/components/app-bar/app-bar';
import { NavLink } from './nav-link';
import styles from './site-chrome.module.css';

/**
 * Skip link + app bar with the brand and the main navigation for non-planner
 * pages. Signed in: "My trips" and the account menu (name, settings, log out).
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
                  {t('nav.explore')}
                </NavLink>
              </li>
              {viewer ? (
                <>
                  <li>
                    <NavLink className={styles.navLink} href={routes.trips(locale)}>
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
            </ul>
          </nav>
        }
      >
        <Link className={styles.brand} href={routes.landing(locale)} aria-label={t('nav.home')}>
          {t('appName')}
        </Link>
      </AppBar>
    </>
  );
}
