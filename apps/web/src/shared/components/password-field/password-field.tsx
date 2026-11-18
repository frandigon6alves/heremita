'use client';

import { useTranslations } from 'next-intl';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { controlClassName, Field } from '../field/field';
import styles from './password-field.module.css';

export interface PasswordFieldProps extends Omit<
  ComponentProps<'input'>,
  'id' | 'type' | 'aria-invalid'
> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  /** `new-password` on sign-up and password change, `current-password` on log-in. */
  autoComplete: 'new-password' | 'current-password';
}

/**
 * Password input with a show/hide toggle. Paste and password managers are
 * never blocked: no paste handlers, a real `autocomplete` value.
 */
export function PasswordField({ label, hint, error, id, className, ...props }: PasswordFieldProps) {
  const t = useTranslations('common.password');
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} id={id}>
      {(control) => (
        <div className={styles.wrapper}>
          <input
            spellCheck={false}
            autoCapitalize="none"
            {...props}
            {...control}
            type={visible ? 'text' : 'password'}
            className={[controlClassName, styles.input, className].filter(Boolean).join(' ')}
          />
          <button
            type="button"
            className={styles.toggle}
            aria-label={visible ? t('hideLabel') : t('showLabel')}
            aria-controls={control.id}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? t('hide') : t('show')}
          </button>
        </div>
      )}
    </Field>
  );
}
