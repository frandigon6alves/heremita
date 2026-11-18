import type { ComponentProps, ReactNode } from 'react';
import { controlClassName, Field } from '../field/field';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id' | 'aria-invalid'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
}

/**
 * Labelled single-line input. Spreads the remaining props (and React Hook
 * Form's `register()` result, `ref` included) onto the `<input>`.
 */
export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      {(control) => (
        <input
          type="text"
          {...props}
          {...control}
          className={className ? `${controlClassName} ${className}` : controlClassName}
        />
      )}
    </Field>
  );
}
