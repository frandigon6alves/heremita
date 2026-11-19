import { useTranslations } from 'next-intl';
import { LegalSection } from './legal-page';

/** The operator's address (FOSSGIS asks for one), or a notice that none is set. */
export function ContactSection({ email }: { email: string | null }) {
  const t = useTranslations('legal.contact');

  return (
    <LegalSection heading={t('heading')}>
      <p>
        {email === null
          ? t('notConfigured')
          : t.rich('body', {
              address: email,
              email: (chunks) => <a href={`mailto:${email}`}>{chunks}</a>,
            })}
      </p>
    </LegalSection>
  );
}
