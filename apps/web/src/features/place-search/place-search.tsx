'use client';

import type { LngLat, PlaceResult } from '@heremita/shared';
import { LIMITS } from '@heremita/shared/plain';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import type { PlaceSearchInput } from '@/lib/api/query-keys';
import { IconButton } from '@/shared/components/icon-button/icon-button';
import { Search, X } from '@/shared/icons/icons';
import type { CaretToRestore, PlaceSearchComboboxProps } from './place-search-combobox';
import styles from './place-search.module.css';

/** Typing pauses this long before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface PlaceSearchProps {
  /** A result was chosen (click, tap, or Enter on the highlighted option). */
  onSelect: (place: PlaceResult) => void;
  /** Bias point, usually the visible map centre. */
  near?: LngLat;
  /** Map zoom that goes with `near`. */
  zoom?: number;
  /** Intent of searches sent while typing; Enter always sends `submit`. Defaults to `autocomplete`. */
  intent?: PlaceSearchInput['intent'];
  /** Accessible name and placeholder; defaults to "Buscar lugares". */
  label?: string;
  /** Shows `label` above the field (forms). By default it is read out only (search pill). */
  showLabel?: boolean;
  /** Initial text (a destination already chosen). */
  defaultValue?: string;
  /** Every change of the text, including the name a selection writes into it. */
  onInputChange?: (text: string) => void;
}

type Combobox = ComponentType<PlaceSearchComboboxProps>;

/** Once loaded, every later `PlaceSearch` renders the combobox from the start. */
let loadedCombobox: Combobox | null = null;
let loading: Promise<Combobox> | null = null;

/** Downloads the combobox (downshift and the search query) once; tests await it. */
export function loadPlaceSearchCombobox(): Promise<Combobox> {
  loading ??= import('./place-search-combobox').then((module) => {
    loadedCombobox = module.PlaceSearchCombobox;
    return loadedCombobox;
  });
  return loading;
}

/**
 * Place search field (E42). It renders as a plain field and loads the
 * combobox (`PlaceSearchCombobox`, with downshift) on the first focus, so
 * pages that show it never pay for it until it is used. What was typed
 * meanwhile, focus and the caret carry over; the field has the combobox
 * role, name and id from the start.
 */
export function PlaceSearch({ defaultValue = '', ...props }: PlaceSearchProps) {
  const t = useTranslations('place-search.search');
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultValue);
  const [loaded, setLoaded] = useState<{ Combobox: Combobox; caret: CaretToRestore | null }>();
  const Ready = loaded?.Combobox ?? loadedCombobox;

  if (Ready !== null) {
    return (
      <Ready {...props} inputId={inputId} initialText={text} restoreCaret={loaded?.caret ?? null} />
    );
  }

  function load() {
    void loadPlaceSearchCombobox().then((Combobox) => {
      const input = inputRef.current;
      const focused = input !== null && document.activeElement === input;
      setLoaded({
        Combobox,
        caret: focused ? { start: input.selectionStart, end: input.selectionEnd } : null,
      });
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter searches once the combobox is in; it never submits a surrounding form.
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  }

  function change(next: string) {
    setText(next);
    props.onInputChange?.(next);
  }

  const name = props.label ?? t('label');
  return (
    <div className={styles.search} role="search">
      <label
        htmlFor={inputId}
        className={props.showLabel === true ? styles.label : styles.hiddenLabel}
      >
        {name}
      </label>
      <div className={styles.inputRow}>
        <span className={styles.leadingIcon}>
          <Search size={20} />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={false}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className={styles.input}
          placeholder={name}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LIMITS.SEARCH_Q_MAX}
          value={text}
          onChange={(event) => change(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onFocus={load}
          // A tap starts the download before the field even has focus.
          onPointerDown={() => void loadPlaceSearchCombobox()}
        />
        {text === '' ? null : (
          <IconButton
            className={styles.clear}
            label={t('clear')}
            icon={<X size={20} />}
            onClick={() => {
              change('');
              inputRef.current?.focus();
            }}
          />
        )}
      </div>
      <ul id={listboxId} role="listbox" aria-label={name} className={styles.menu} hidden />
      <div className={styles.status} role="status" />
    </div>
  );
}
