'use client';

import { endpoints, LIMITS, signUpBodySchema } from '@heremita/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { bodyFieldsOf, hasCode } from '@/lib/api/failure';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { PasswordField } from '@/shared/components/password-field/password-field';
import { TextField } from '@/shared/components/text-field/text-field';
import { useSignedIn } from './use-signed-in';
import styles from './auth-form.module.css';

const FIELDS = ['displayName', 'email', 'password'] as const;
type SignUpField = (typeof FIELDS)[number];

/** Marks the e-mail error that comes with a "Log in instead" link. */
const EMAIL_TAKEN = 'email_taken';
/** A field the API refused although it passed the shared schema here. */
const SERVER = 'server';

interface SignupFormProps {
  /** Validated `?next=`; without it a new account starts a trip. */
  next?: string;
}

/** Sign-up (E4): name, e-mail, password. The page's locale becomes the account's. */
export function SignupForm({ next }: SignupFormProps) {
  const locale = useLocale();
  const t = useTranslations('auth');
  const signedIn = useSignedIn();
  const [formError, setFormError] = useState<{ error: unknown } | null>(null);
  // Stays true after success: the button keeps its busy state until the next page shows.
  const [leaving, setLeaving] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signUpBodySchema),
    // Errors show once a field is left, then follow every change.
    mode: 'onTouched',
    defaultValues: { displayName: '', email: '', password: '', locale },
  });

  const onSubmit = handleSubmit(async (body) => {
    setFormError(null);
    try {
      const me = await apiFetch(endpoints.signUp, { body });
      setLeaving(true);
      signedIn(me, next ?? routes.newTrip(locale));
    } catch (error) {
      const fields = bodyFieldsOf(error, FIELDS);
      if (hasCode(error, 'email_taken')) {
        setError('email', { type: EMAIL_TAKEN }, { shouldFocus: true });
      } else if (fields.length > 0) {
        fields.forEach((field, index) =>
          setError(field, { type: SERVER }, { shouldFocus: index === 0 }),
        );
      } else {
        setFormError({ error });
      }
    }
  });
  const pending = isSubmitting || leaving;

  const message = (field: SignUpField, error: FieldError | undefined): ReactNode => {
    if (error === undefined) {
      return undefined;
    }
    switch (field) {
      case 'displayName':
        if (error.type === SERVER) {
          return t('errors.displayNameRejected');
        }
        return error.type === 'too_big'
          ? t('errors.displayNameTooLong', { max: LIMITS.DISPLAY_NAME_MAX })
          : t('errors.displayNameRequired');
      case 'email':
        if (error.type === EMAIL_TAKEN) {
          return (
            <>
              {t('errors.emailTaken')}{' '}
              <Link href={routes.login(locale, { next })}>{t('errors.emailTakenLogIn')}</Link>
            </>
          );
        }
        return error.type === SERVER ? t('errors.emailRejected') : t('errors.emailInvalid');
      case 'password':
        return passwordMessage(error.type, t);
    }
  };

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
      <TextField
        label={t('signup.displayName')}
        hint={t('signup.displayNameHint')}
        error={message('displayName', errors.displayName)}
        autoComplete="name"
        {...register('displayName')}
      />
      <TextField
        label={t('signup.email')}
        error={message('email', errors.email)}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        {...register('email')}
      />
      <PasswordField
        label={t('signup.password')}
        hint={t('signup.passwordHint', { min: LIMITS.PASSWORD_MIN })}
        error={message('password', errors.password)}
        autoComplete="new-password"
        {...register('password')}
      />
      {formError === null ? null : <FormAlert error={formError.error} />}
      <Button type="submit" variant="primary" size="large" block busy={pending}>
        {pending ? t('signup.submitting') : t('signup.submit')}
      </Button>
      <p className={styles.switch}>
        {t('signup.haveAccount')}{' '}
        <Link className={styles.switchLink} href={routes.login(locale, { next })}>
          {t('signup.logIn')}
        </Link>
      </p>
    </form>
  );
}

function passwordMessage(type: string, t: ReturnType<typeof useTranslations<'auth'>>): string {
  switch (type) {
    case SERVER:
      return t('errors.passwordRejected');
    case 'too_big':
      return t('errors.passwordTooLong', { max: LIMITS.PASSWORD_MAX });
    case 'custom':
      return t('errors.passwordIsEmail');
    default:
      return t('errors.passwordTooShort', { min: LIMITS.PASSWORD_MIN });
  }
}
