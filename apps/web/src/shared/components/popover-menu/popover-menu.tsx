'use client';

import { useId, useRef, type ReactNode } from 'react';
import styles from './popover-menu.module.css';

interface PopoverMenuItemBase {
  id: string;
  label: string;
  /** Decorative icon from `@/shared/icons`. */
  icon?: ReactNode;
  /** The value already in effect (current day, current mode); stated with `aria-current`. */
  current?: boolean;
  disabled?: boolean;
  /** `danger` for destructive actions ("Excluir da viagem"). */
  tone?: 'danger';
}

/** An action, or a link out (map app hand-off) opened in a new tab. */
export type PopoverMenuItem = PopoverMenuItemBase &
  ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

export interface PopoverMenuSection {
  /** Optional caption above the section ("Mover para o dia…"). */
  heading?: string;
  items: readonly PopoverMenuItem[];
}

export interface PopoverMenuProps {
  /** Visible trigger content: an icon, text, or both. */
  trigger: ReactNode;
  /** Accessible name of the trigger; required when it shows only an icon. */
  label?: string;
  /** Extra class for the trigger (e.g. a chip look for "Dia: Ideias ▾"). */
  triggerClassName?: string;
  sections: readonly PopoverMenuSection[];
  disabled?: boolean;
}

function anchorNameFor(id: string): string {
  return `--popover-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/**
 * A button that opens a native `popover="auto"` list of buttons and links
 * (light dismiss, Escape and focus return come from the browser). Plain
 * buttons in a list, not `role="menu"`: they read and tab like the rest of
 * the page. Anchored under the trigger where CSS anchor positioning exists,
 * else pinned to the bottom of the screen within thumb reach.
 */
export function PopoverMenu({
  trigger,
  label,
  triggerClassName,
  sections,
  disabled = false,
}: PopoverMenuProps) {
  const popoverId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorName = anchorNameFor(popoverId);

  function choose(item: PopoverMenuItem) {
    popoverRef.current?.hidePopover();
    item.onSelect?.();
  }

  return (
    <>
      <button
        type="button"
        className={[styles.trigger, triggerClassName].filter(Boolean).join(' ')}
        popoverTarget={popoverId}
        aria-label={label}
        disabled={disabled}
        style={{ anchorName }}
      >
        {trigger}
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className={styles.popover}
        style={{ positionAnchor: anchorName }}
      >
        {sections.map((section, index) => (
          <div key={section.heading ?? index} className={styles.section}>
            {section.heading ? (
              <p className={styles.heading} id={`${popoverId}-${index}`}>
                {section.heading}
              </p>
            ) : null}
            <ul
              className={styles.items}
              aria-labelledby={section.heading ? `${popoverId}-${index}` : undefined}
            >
              {section.items.map((item) => (
                <li key={item.id}>
                  <PopoverMenuEntry item={item} onChoose={() => choose(item)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function PopoverMenuEntry({ item, onChoose }: { item: PopoverMenuItem; onChoose: () => void }) {
  const className = [styles.item, item.tone === 'danger' ? styles.danger : undefined]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {item.icon}
      <span>{item.label}</span>
    </>
  );

  if (item.href !== undefined) {
    return (
      <a
        className={className}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-current={item.current ? 'true' : undefined}
        onClick={onChoose}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={item.disabled}
      aria-current={item.current ? 'true' : undefined}
      onClick={onChoose}
    >
      {content}
    </button>
  );
}
