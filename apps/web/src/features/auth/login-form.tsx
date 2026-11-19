'use client';

import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { logInBodySchema } from '@/lib/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { bodyFieldsOf, hasCode } from '@/lib/api/failure';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { PasswordField } from '@/shared/components/password-field/password-field';
import { TextField } from '@/shared/components/text-field/text-field';
import { useSignedIn } from './use-signed-in';
import styles from './auth-form.module.css';

const FIELDS = ['email', 'password'] as const;

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
  const [formError, setFormError] = useState<{ error: unknown } | null>(null);
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
      const me = await apiFetch(apiRoutes.logIn, { body });
      setLeaving(true);
      signedIn(me, next ?? routes.trips(locale));
    } catch (error) {
      const fields = bodyFieldsOf(error, FIELDS);
      if (fields.length > 0) {
        fields.forEach((field, index) =>
          setError(field, { type: 'server' }, { shouldFocus: index === 0 }),
        );
      } else {
        setFormError({ error });
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
      {formError === null ? null : (
        <FormAlert
          error={formError.error}
          message={
            hasCode(formError.error, 'invalid_credentials')
              ? t('errors.invalidCredentials')
              : undefined
          }
        />
      )}
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
