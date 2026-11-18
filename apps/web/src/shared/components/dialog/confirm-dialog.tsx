'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '../button/button';
import { Dialog, DialogActions, initialFocus } from './dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** What will happen and what is lost. */
  children: ReactNode;
  /** Names the action ("Excluir viagem"), never just "OK". */
  confirmLabel: string;
  onConfirm: () => void;
  /** The confirmation request is in flight: confirm shows a spinner, both buttons wait. */
  busy?: boolean;
}

/**
 * Confirmation for an irreversible action (delete trip, delete a day with
 * stops). Cancel takes the initial focus so Enter never destroys anything.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  onConfirm,
  busy = false,
}: ConfirmDialogProps) {
  const t = useTranslations('common.actions');

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {children}
      <DialogActions>
        <Button {...initialFocus} disabled={busy} onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button variant="danger" busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
