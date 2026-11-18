'use client';

import { endpoints, LIMITS, logInBodySchema } from '@heremita/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { PasswordField } from '@/shared/components/password-field/password-field';
import { TextField } from '@/shared/components/text-field/text-field';
import { FormAlert } from './form-alert';
import { isFormLevel, serverFormError, type FormLevelError } from './server-form-error';
import { useSignedIn } from './use-signed-in';
import styles from './auth-form.module.css';

const FIELDS = ['email', 'password'] as const;
type LogInField = (typeof FIELDS)[number];

interface LoginFormProps {
  /** Validated `?next=`; without it the viewer lands on their trips. */
  next?: string;
}

/**
 * Log-in (E5). A wrong e-mail or password is one form-level message: the API
 * does not say which of the two was wrong, and neither does the form.
 */
export function LoginForm({ next }: LoginFormProps) {
  const locale = useLocale();
  const t = useTranslations('auth');
  const signedIn = useSignedIn();
  const [formError, setFormError] = useState<FormLevelError | null>(null);
  // Stays true after success: the button keeps its busy state until the next page shows.
  const [leaving, setLeaving] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(logInBodySchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (body) => {
    setFormError(null);
    try {
      const me = await apiFetch(endpoints.logIn, { body });
      setLeaving(true);
      signedIn(me, next ?? routes.trips(locale));
    } catch (error) {
      const outcome = serverFormError<LogInField>(error, FIELDS);
      if (outcome.kind === 'fields') {
        outcome.fields.forEach((field, index) =>
          setError(field, { type: 'server' }, { shouldFocus: index === 0 }),
        );
      } else if (isFormLevel(outcome)) {
        setFormError(outcome);
      }
    }
  });
  const pending = isSubmitting || leaving;

  const passwordError = (): string | undefined => {
    if (errors.password === undefined) {
      return undefined;
    }
    return errors.password.type === 'too_big'
      ? t('errors.passwordTooLong', { max: LIMITS.PASSWORD_MAX })
      : t('errors.passwordRequired');
  };

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
      <TextField
        label={t('login.email')}
        error={errors.email === undefined ? undefined : t('errors.emailInvalid')}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        {...register('email')}
      />
      <PasswordField
        label={t('login.password')}
        error={passwordError()}
        autoComplete="current-password"
        {...register('password')}
      />
      {formError === null ? null : <FormAlert error={formError} />}
      <Button type="submit" variant="primary" size="large" block busy={pending}>
        {pending ? t('login.submitting') : t('login.submit')}
      </Button>
      <p className={styles.note}>{t('login.forgotPassword')}</p>
      <p className={styles.switch}>
        {t('login.noAccount')}{' '}
        <Link className={styles.switchLink} href={routes.signup(locale, { next })}>
          {t('login.signUp')}
        </Link>
      </p>
    </form>
  );
}
