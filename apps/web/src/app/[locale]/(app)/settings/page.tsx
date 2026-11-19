import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/features/auth/logout-button';
import { AccountActions } from '@/features/settings/account-actions';
import { BlockedUsers } from '@/features/settings/blocked-users';
import { PasswordForm } from '@/features/settings/password-form';
import { PreferencesForm } from '@/features/settings/preferences-form';
import { ProfileForm } from '@/features/settings/profile-form';
import { PREFERENCES_ANCHOR } from '@/features/settings/sections';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';
import styles from './settings-page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('metaTitle') };
}

const SECTIONS = ['profile', PREFERENCES_ANCHOR, 'security', 'privacy', 'account'] as const;

/** The viewer's account on one page, in anchored sections (E8 from the server, edits from the browser). */
export default async function SettingsPage() {
  const locale = await getLocale();
  const t = await getTranslations('settings');
  // The members-only gate already read it in this render; `null` means the session ended since.
  const viewer = await getViewer();
  if (viewer === null) {
    redirect(routes.login(locale, { next: routes.settings(locale) }));
  }

  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>{t('title')}</h1>
      <nav aria-label={t('sections.label')}>
        <ul className={styles.sectionNav} role="list">
          {SECTIONS.map((section) => (
            <li key={section}>
              <a className={styles.sectionLink} href={`#${section}`}>
                {t(`sections.${section}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section id="profile" className={styles.section} aria-labelledby="profile-title">
        <h2 id="profile-title" className={styles.heading}>
          {t('sections.profile')}
        </h2>
        <ProfileForm displayName={viewer.displayName} />
      </section>
      <section
        id={PREFERENCES_ANCHOR}
        className={styles.section}
        aria-labelledby="preferences-title"
      >
        <h2 id="preferences-title" className={styles.heading}>
          {t('sections.preferences')}
        </h2>
        <PreferencesForm />
      </section>
      <section id="security" className={styles.section} aria-labelledby="security-title">
        <h2 id="security-title" className={styles.heading}>
          {t('sections.security')}
        </h2>
        <PasswordForm email={viewer.email} />
      </section>
      <section id="privacy" className={styles.section} aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={styles.heading}>
          {t('sections.privacy')}
        </h2>
        <p className={styles.intro}>{t('blocked.intro')}</p>
        <BlockedUsers />
      </section>
      <section id="account" className={styles.section} aria-labelledby="account-title">
        <h2 id="account-title" className={styles.heading}>
          {t('sections.account')}
        </h2>
        <AccountActions logOut={<LogoutButton />} />
      </section>
    </main>
  );
}
