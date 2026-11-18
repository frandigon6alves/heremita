import { useId, type ReactNode } from 'react';
import styles from './field.module.css';

/** Props a form control needs to be labelled and described by its `Field`. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  label: ReactNode;
  /** Always-visible help ("mínimo 12 caracteres"); linked to the control. */
  hint?: ReactNode;
  /** Current error message; when set the control is marked invalid and the message is alerted. */
  error?: ReactNode;
  /** Id for the control; generated when omitted. */
  id?: string;
  /** Renders the control with the wiring props spread on it. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + hint + error around one control (L11): the control gets
 * `aria-invalid="true"` while there is an error and `aria-describedby`
 * pointing at the hint and the error, which has `role="alert"`.
 */
export function Field({ label, hint, error, id, children }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const describedBy = [hint ? hintId : undefined, hasError ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children({
        id: controlId,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': hasError ? true : undefined,
      })}
      {hasError ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const controlClassName = styles.control;
