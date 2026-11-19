'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { VisuallyHidden } from '../visually-hidden/visually-hidden';
import styles from './skeleton.module.css';

/** Fast responses never flash a skeleton: it shows only after this wait. */
export const SKELETON_DELAY_MS = 250;

export interface SkeletonProps {
  /** `SkeletonBlock`s shaped like the content that is loading (same height: no layout shift). */
  children: ReactNode;
  /** Read out instead of the shapes; defaults to "Carregando…". */
  label?: string;
}

/**
 * Loading state of a data region: placeholder shapes that take the content's
 * space at once and become visible after `SKELETON_DELAY_MS`. Not for
 * buttons, toasts, menus or dialogs (use `Spinner` or a busy `Button`).
 */
export function Skeleton({ children, label }: SkeletonProps) {
  const t = useTranslations('common.states');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div aria-busy="true">
      <VisuallyHidden>{label ?? t('loading')}</VisuallyHidden>
      <div className={styles.skeleton} data-visible={visible} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

export interface SkeletonBlockProps {
  /** `text` = one line of body text; `block` = a card or image. */
  shape?: 'text' | 'block';
  /** CSS length; defaults to full width. */
  width?: string;
  /** CSS length; ignored for `text`, which is one line high. */
  height?: string;
}

/** One grey placeholder shape inside a `Skeleton`. */
export function SkeletonBlock({ shape = 'block', width, height = '1rem' }: SkeletonBlockProps) {
  const size: CSSProperties =
    shape === 'text' ? { width: width ?? '100%' } : { width: width ?? '100%', height };

  return (
    <span
      className={shape === 'text' ? `${styles.block} ${styles.text}` : styles.block}
      style={size}
    />
  );
}
