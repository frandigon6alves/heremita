'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { X } from '@/shared/icons/icons';
import styles from './toaster.module.css';
import {
  dismissToast,
  getServerSnapshot,
  getSnapshot,
  holdToast,
  subscribe,
  type Toast,
} from './toast-store';

function ToastItem({ toast }: { toast: Toast }) {
  const t = useTranslations('common.toast');
  const { id, durationMs, action, message } = toast;
  // Hover or focus inside holds the toast so its Undo stays reachable (WCAG 2.2.1).
  const [held, setHeldState] = useState(false);
  function setHeld(next: boolean) {
    setHeldState(next);
    holdToast(id, next);
  }

  useEffect(() => {
    if (durationMs === null || held) {
      return;
    }
    const timer = window.setTimeout(() => dismissToast(id), durationMs);
    return () => window.clearTimeout(timer);
  }, [id, durationMs, held]);

  return (
    <li
      className={styles.toast}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHeld(false);
        }
      }}
    >
      <p className={styles.message}>{message}</p>
      {action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            action.onAction();
            dismissToast(id);
          }}
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        className={styles.dismiss}
        aria-label={t('dismiss')}
        onClick={() => dismissToast(id)}
      >
        <X size={20} />
      </button>
    </li>
  );
}

/**
 * The app's one notification area: visible toasts plus the single polite live
 * region that reads toasts and other announcements out. Rendered once by the
 * root layout.
 */
export function Toaster() {
  const t = useTranslations('common.toast');
  const { toasts, announcement } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <>
      <div className={styles.liveRegion} role="status" aria-live="polite" aria-atomic="true">
        {announcement ? (
          <span key={announcement.id}>
            {announcement.action === undefined
              ? announcement.text
              : t('withAction', { message: announcement.text, action: announcement.action })}
          </span>
        ) : null}
      </div>
      {toasts.length > 0 ? (
        <section className={styles.toaster} aria-label={t('region')}>
          <ol className={styles.list} role="list">
            {toasts.map((toast) => (
              <ToastItem key={toast.id} toast={toast} />
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
