'use client';

import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from 'react';
import styles from './dialog.module.css';

/** Spread on the control that should receive focus when the dialog opens (the least destructive one). */
export const initialFocus = { 'data-initial-focus': '' } as const;

export interface DialogProps {
  open: boolean;
  /** Called on Escape and when the dialog closed itself; the parent then sets `open` to false. */
  onClose: () => void;
  /** Rendered as the dialog's `<h2>` and its accessible name. */
  title: ReactNode;
  children: ReactNode;
}

/**
 * Modal confirmation or short form on a native `<dialog>` opened with
 * `showModal()` (focus trap, Escape, inert page for free). On open, focus
 * goes to the element marked with `initialFocus` (else the browser's first
 * focusable); on close, focus returns to the control that opened it.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || dialog === null) {
      return;
    }
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      if (invoker?.isConnected) {
        invoker.focus();
      }
    };
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Escape: the parent owns `open`, so it closes the dialog.
    event.preventDefault();
    onClose();
  }

  function handleClose(event: SyntheticEvent<HTMLDialogElement>) {
    // The browser closed it on its own (a repeated Escape cannot be prevented).
    // Ignore the close our own cleanup caused when the dialog is shown again.
    if (open && !event.currentTarget.open) {
      onClose();
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClose={handleClose}
    >
      {open ? (
        <div className={styles.content}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** Right-aligned row of dialog buttons, in reading order: the primary action goes last. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
