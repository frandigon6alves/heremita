import type { PublicTripCard as PublicTripCardData } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { LinkButton } from '@/shared/components/link-button/link-button';
import { ArrowRight, ListOrdered, MapPin, Route, Sparkles, Users } from '@/shared/icons/icons';
import { LandingIllustration } from './landing-illustration';
import { PublicTripCard } from './public-trip-card';
import styles from './landing.module.css';

export interface LandingProps {
  /** Signed in: the call to action goes to my trips instead of sign-up. */
  signedIn: boolean;
  /** Newest public trips (E48); an empty list hides the community strip. */
  communityTrips: readonly PublicTripCardData[];
}

const STEPS = [
  { key: 'mark', Icon: MapPin },
  { key: 'organise', Icon: ListOrdered },
  { key: 'follow', Icon: Route },
] as const;

/**
 * The start page: headline, three numbered steps in the day colours, a
 * static illustration (the text is the largest paint, not a map), the
 * community strip, and the call to action (in the hero from tablet width, a
 * sticky bar at the bottom on phones).
 */
export function Landing({ signedIn, communityTrips }: LandingProps) {
  const t = useTranslations('explore.landing');
  const locale = useLocale();
  const cta = signedIn
    ? { href: routes.trips(locale), label: t('ctaSignedIn') }
    : { href: routes.signup(locale), label: t('cta') };

  return (
    <main id="main" className={styles.main}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>
            <Sparkles size={20} />
            {t('eyebrow')}
          </p>
          <h1 id="landing-title" className={styles.title}>
            {t.rich('title', {
              em: (chunks) => <em className={styles.highlight}>{chunks}</em>,
            })}
          </h1>
          <p className={styles.lead}>{t('lead')}</p>
          <div className={styles.heroActions}>
            <LinkButton className={styles.heroCta} variant="primary" size="large" href={cta.href}>
              {cta.label}
              <ArrowRight size={20} />
            </LinkButton>
            <Link className={styles.heroSecondary} href={routes.explore(locale)}>
              {t('exploreLink')}
            </Link>
          </div>
        </div>
        <div className={styles.illustrationFrame}>
          <LandingIllustration className={styles.illustration} />
        </div>
      </section>

      <section aria-labelledby="steps-title" className={styles.section}>
        <h2 id="steps-title" className={styles.sectionTitle}>
          {t('stepsTitle')}
        </h2>
        <ol className={styles.steps} role="list">
          {STEPS.map(({ key, Icon }, index) => (
            <li key={key} className={styles.step} data-step={index + 1}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.stepIcon}>
                <Icon />
              </span>
              <h3 className={styles.stepTitle}>{t(`steps.${key}.title`)}</h3>
              <p className={styles.stepBody}>{t(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {communityTrips.length === 0 ? null : (
        <section aria-labelledby="community-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="community-title" className={styles.sectionTitle}>
              <Users className={styles.sectionIcon} />
              {t('communityTitle')}
            </h2>
            <Link className={styles.more} href={routes.explore(locale)}>
              {t('communityMore')}
              <ArrowRight size={20} />
            </Link>
          </div>
          <ul className={styles.strip} role="list">
            {communityTrips.map((trip) => (
              <li key={trip.id} className={styles.stripItem}>
                <PublicTripCard trip={trip} headingLevel={3} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.stickyCta}>
        <LinkButton variant="primary" size="large" block href={cta.href}>
          {cta.label}
          <ArrowRight size={20} />
        </LinkButton>
      </div>
    </main>
  );
}
