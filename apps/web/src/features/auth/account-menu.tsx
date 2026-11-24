import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useId } from 'react';
import { routes } from '@/lib/routes';
import { ChevronDown, LogOut, Settings, ShieldCheck } from '@/shared/icons/icons';
import { LogoutButton } from './logout-button';
import styles from './account-menu.module.css';

/** The first letter of the name, for the avatar circle. */
function initialOf(displayName: string): string {
  return [...displayName.trim()][0]?.toLocaleUpperCase() ?? '';
}

/**
 * The signed-in viewer in the app bar: an avatar with their initial and
 * their name open a native popover (light dismiss, Escape, focus return by
 * the browser) with Settings, Moderation for moderators, and Log out.
 */
export function AccountMenu({
  displayName,
  moderator = false,
}: {
  displayName: string;
  moderator?: boolean;
}) {
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
        <span className={styles.avatar} aria-hidden="true">
          {initialOf(displayName)}
        </span>
        <span className={styles.name}>{displayName}</span>
        <ChevronDown size={20} className={styles.chevron} />
      </button>
      <div id={popoverId} popover="auto" className={styles.popover}>
        <p className={styles.signedInAs}>
          {t('signedInAs')} <strong className={styles.fullName}>{displayName}</strong>
        </p>
        <ul className={styles.items} role="list">
          <li>
            <Link className={styles.item} href={routes.settings(locale)}>
              <Settings size={20} />
              {t('settings')}
            </Link>
          </li>
          {moderator && (
            <li>
              <Link className={styles.item} href={routes.moderation(locale)}>
                <ShieldCheck size={20} />
                {t('moderation')}
              </Link>
            </li>
          )}
          <li>
            <LogoutButton className={styles.item} icon={<LogOut size={20} />} />
          </li>
        </ul>
      </div>
    </>
  );
}
