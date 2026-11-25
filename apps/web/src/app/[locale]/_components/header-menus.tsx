import { useLocale, useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';
import { LogoutButton } from '@/features/auth/logout-button';
import { MenuLink } from '@/features/auth/menu-link';
import { routes } from '@/lib/routes';
import { buttonClassName } from '@/shared/components/button/button-class';
import { Compass, Languages, LogOut, Map, Settings, ShieldCheck } from '@/shared/icons/icons';
import { LanguageOptions } from './language-options';
import { THEME_ICONS } from './theme-icons';
import { ThemeOptions } from './theme-options';
import styles from './header-menus.module.css';

// Native `popover="auto"` menus (light dismiss, Escape, focus return by the
// browser). These components carry no client code of their own: only the
// language links, the theme control and the menu links inside are client leaves.

interface PopoverMenuShellProps {
  label: string;
  trigger: ReactNode;
  className?: string;
  children: ReactNode;
}

function PopoverMenuShell({ label, trigger, className, children }: PopoverMenuShellProps) {
  const popoverId = useId();
  return (
    <>
      <button type="button" className={styles.trigger} popoverTarget={popoverId} aria-label={label}>
        {trigger}
      </button>
      <div
        id={popoverId}
        popover="auto"
        className={[styles.popover, className].filter(Boolean).join(' ')}
      >
        {children}
      </div>
    </>
  );
}

/** Desktop app bar: the language menu. */
export function LanguageMenu({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('common.preferences');
  return (
    <PopoverMenuShell label={t('language')} trigger={<Languages size={24} />}>
      <LanguageOptions signedIn={signedIn} />
    </PopoverMenuShell>
  );
}

/**
 * Desktop app bar: the theme menu. Its icon is the chosen theme's, picked by
 * CSS from `<html data-theme>` so it is right from the first paint.
 */
export function ThemeMenu({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('common.preferences');
  return (
    <PopoverMenuShell
      label={t('theme')}
      trigger={(Object.keys(THEME_ICONS) as (keyof typeof THEME_ICONS)[]).map((theme) => {
        const Icon = THEME_ICONS[theme];
        return (
          <span key={theme} className={styles.themeIcon} data-theme-icon={theme}>
            <Icon size={24} />
          </span>
        );
      })}
    >
      <ThemeOptions signedIn={signedIn} />
    </PopoverMenuShell>
  );
}

export interface MobileMenuViewer {
  displayName: string;
  moderator: boolean;
}

/**
 * Phones: one menu behind a gear with everything the desktop bar spreads
 * out: the pages, the account (or log in / sign up), language and theme.
 */
export function MobileMenu({ viewer }: { viewer: MobileMenuViewer | null }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const tAccount = useTranslations('auth.account');

  return (
    <PopoverMenuShell
      label={t('preferences.mainMenu')}
      trigger={<Settings size={24} />}
      className={styles.mobilePopover}
    >
      {viewer ? (
        <p className={styles.signedInAs}>
          {tAccount('signedInAs')} <strong className={styles.fullName}>{viewer.displayName}</strong>
        </p>
      ) : null}
      <section className={styles.section}>
        <ul className={styles.items} role="list">
          <li>
            <MenuLink className={styles.item} href={routes.explore(locale)}>
              <Compass size={20} />
              {t('nav.explore')}
            </MenuLink>
          </li>
          {viewer ? (
            <>
              <li>
                <MenuLink className={styles.item} href={routes.trips(locale)}>
                  <Map size={20} />
                  {t('nav.myTrips')}
                </MenuLink>
              </li>
              <li>
                <MenuLink className={styles.item} href={routes.settings(locale)}>
                  <Settings size={20} />
                  {tAccount('settings')}
                </MenuLink>
              </li>
              {viewer.moderator ? (
                <li>
                  <MenuLink className={styles.item} href={routes.moderation(locale)}>
                    <ShieldCheck size={20} />
                    {tAccount('moderation')}
                  </MenuLink>
                </li>
              ) : null}
              <li>
                <LogoutButton className={styles.item} icon={<LogOut size={20} />} />
              </li>
            </>
          ) : null}
        </ul>
        {viewer ? null : (
          <div className={styles.authActions}>
            <MenuLink
              className={buttonClassName({ variant: 'secondary', block: true })}
              href={routes.login(locale)}
            >
              {t('nav.logIn')}
            </MenuLink>
            <MenuLink
              className={buttonClassName({ variant: 'primary', block: true })}
              href={routes.signup(locale)}
            >
              {t('nav.signUp')}
            </MenuLink>
          </div>
        )}
      </section>
      <LanguageOptions signedIn={viewer !== null} />
      <ThemeOptions signedIn={viewer !== null} />
    </PopoverMenuShell>
  );
}
