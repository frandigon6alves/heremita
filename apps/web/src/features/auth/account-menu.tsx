import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useId } from 'react';
import { routes } from '@/lib/routes';
import { LogoutButton } from './logout-button';
import styles from './account-menu.module.css';

/**
 * The signed-in viewer in the app bar: their name opens a native popover
 * (light dismiss, Escape, focus return by the browser) with Settings and
 * Log out.
 */
export function AccountMenu({ displayName }: { displayName: string }) {
  const locale = useLocale();
  const t = useTranslations('auth.account');
  const popoverId = useId();

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        popoverTarget={popoverId}
        aria-label={t('menu', { name: displayName })}
      >
        <span className={styles.name}>{displayName}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      <div id={popoverId} popover="auto" className={styles.popover}>
        <p className={styles.signedInAs}>
          {t('signedInAs')} <strong className={styles.fullName}>{displayName}</strong>
        </p>
        <ul className={styles.items} role="list">
          <li>
            <Link className={styles.item} href={routes.settings(locale)}>
              {t('settings')}
            </Link>
          </li>
          <li>
            <LogoutButton className={styles.item} />
          </li>
        </ul>
      </div>
    </>
  );
}
