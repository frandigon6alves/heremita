import type { ComponentProps, ReactNode } from 'react';
import { controlClassName, Field } from '../field/field';
import styles from './text-area.module.css';

export interface TextAreaProps extends Omit<ComponentProps<'textarea'>, 'id' | 'aria-invalid'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
}

/** Labelled multi-line input (notes, review text); resizes vertically only. */
export function TextArea({ label, hint, error, id, className, ...props }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      {(control) => (
        <textarea
          rows={4}
          {...props}
          {...control}
          className={[controlClassName, styles.textArea, className].filter(Boolean).join(' ')}
        />
      )}
    </Field>
  );
}
