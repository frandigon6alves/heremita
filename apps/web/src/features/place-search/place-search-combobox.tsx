'use client';

import type { PlaceResult } from '@heremita/shared';
import { LIMITS } from '@heremita/shared/plain';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCombobox } from 'downshift';
import { useLocale, useTranslations } from 'next-intl';
import {
  useEffectEvent,
  useLayoutEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { normaliseSearchText, placeSearchQuery } from '@/lib/api/query-keys';
import { Button } from '@/shared/components/button/button';
import { IconButton } from '@/shared/components/icon-button/icon-button';
import { Spinner } from '@/shared/components/spinner/spinner';
import { VisuallyHidden } from '@/shared/components/visually-hidden/visually-hidden';
import { Search, X } from '@/shared/icons/icons';
import { geocodingFailure } from './geocoding-failure';
import { SEARCH_DEBOUNCE_MS, type PlaceSearchProps } from './place-search';
import { useDebouncedValue } from './use-debounced-value';
import styles from './place-search.module.css';

/** Where the caret was in the field this one replaces; `null` when it had no focus. */
export interface CaretToRestore {
  start: number | null;
  end: number | null;
}

export interface PlaceSearchComboboxProps extends Omit<PlaceSearchProps, 'defaultValue'> {
  /** Id of the field, kept from the plain field so the label and focus carry over. */
  inputId: string;
  /** What was typed into the plain field (or `defaultValue`). */
  initialText: string;
  /** Focus the field and put the caret back, when the plain field had focus. */
  restoreCaret: CaretToRestore | null;
  /** Text was typed into the plain field: open the suggestions for it at once. */
  typedBefore: boolean;
}

/**
 * Place search combobox (E42), loaded by `PlaceSearch` on first focus.
 * Searches 300 ms after typing stops once the text has 3 characters, aborts superseded requests, keeps the previous
 * suggestions while the next ones load, and sends the text as a `submit`
 * search on Enter. Busy, unavailable, empty and short-text states are
 * explained under the field (never as a toast).
 */
export function PlaceSearchCombobox({
  onSelect,
  near,
  zoom,
  intent = 'autocomplete',
  label,
  showLabel = false,
  onInputChange,
  inputId,
  initialText,
  restoreCaret,
  typedBefore,
}: PlaceSearchComboboxProps) {
  const t = useTranslations('place-search.search');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [text, setText] = useState(initialText);

  // Mounted in place of the plain field that had focus: keep typing here.
  const restoreFocus = useEffectEvent(() => {
    const input = document.getElementById(inputId);
    if (restoreCaret !== null && input instanceof HTMLInputElement) {
      input.focus();
      input.setSelectionRange(restoreCaret.start, restoreCaret.end);
    }
  });
  useLayoutEffect(() => restoreFocus(), []);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);

  const typed = normaliseSearchText(text);
  const submitting = submitted !== null && submitted === typed;
  const settled = normaliseSearchText(debounced);
  const tooShort = typed.length > 0 && typed.length < LIMITS.SEARCH_Q_MIN;
  // The query follows what was typed only once typing paused (or Enter was pressed).
  const waitingForPause = !submitting && settled !== typed;

  const options = placeSearchQuery({
    q: submitting ? typed : settled,
    locale,
    near,
    zoom,
    intent: submitting ? 'submit' : intent,
  });
  const usable = typed.length >= LIMITS.SEARCH_Q_MIN;

  const [menuOpen, setMenuOpen] = useState(typedBefore);
  const search = useQuery({
    ...options,
    enabled: options.enabled === true && usable && menuOpen,
    placeholderData: keepPreviousData,
  });
  const items = usable && menuOpen ? (search.data?.items ?? []) : [];

  const { highlightedIndex, getLabelProps, getInputProps, getMenuProps, getItemProps } =
    useCombobox<PlaceResult>({
      items,
      inputId,
      isOpen: menuOpen,
      inputValue: text,
      selectedItem: null,
      itemToString: (item) => item?.name ?? '',
      itemToKey: (item) => item?.key,
      onInputValueChange: ({ type, inputValue }) => {
        // Downshift empties the field one edit after a pick, because `selectedItem`
        // is held at null; the viewer's text wins.
        if (type === useCombobox.stateChangeTypes.ControlledPropUpdatedSelectedItem) {
          return;
        }
        setText(inputValue);
        setSubmitted(null);
        onInputChange?.(inputValue);
      },
      onIsOpenChange: ({ isOpen: open }) => setMenuOpen(open),
      onSelectedItemChange: ({ selectedItem }) => {
        if (selectedItem) {
          onSelect(selectedItem);
        }
      },
    });

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || highlightedIndex >= 0) {
      return;
    }
    event.preventDefault();
    (event.nativeEvent as Event & { preventDownshiftDefault?: boolean }).preventDownshiftDefault =
      true;
    if (usable) {
      setSubmitted(typed);
      setMenuOpen(true);
    }
  }

  function clear() {
    setText('');
    setSubmitted(null);
    setMenuOpen(false);
    onInputChange?.('');
    document.getElementById(inputId)?.focus();
  }

  function retry() {
    setMenuOpen(true);
    void search.refetch();
    document.getElementById(inputId)?.focus();
  }

  const name = label ?? t('label');
  const loading = usable && menuOpen && (search.isFetching || waitingForPause);
  // Kept after the field loses focus, so its Retry button can be reached.
  const failure = usable && search.isError ? geocodingFailure(search.error) : null;

  function statusText() {
    if (tooShort) {
      return t('minChars', { min: LIMITS.SEARCH_Q_MIN });
    }
    if (failure !== null) {
      switch (failure.kind) {
        case 'busy':
          return t('busy');
        case 'unavailable':
          return t('unavailable');
        case 'offline':
          return t('offline');
        case 'unexpected':
          return (
            <>
              {t('failed')}{' '}
              <span className={styles.reference}>
                {failure.code ? tCommon('states.errorCode', { code: failure.code }) : null}{' '}
                {failure.requestId
                  ? tCommon('states.requestId', { requestId: failure.requestId })
                  : null}
              </span>
            </>
          );
      }
    }
    if (!usable || !menuOpen) {
      return null;
    }
    if (loading && items.length === 0) {
      return t('searching');
    }
    if (loading || !search.isSuccess || search.isPlaceholderData) {
      return null;
    }
    if (items.length === 0) {
      return t('empty', { query: typed });
    }
    return <VisuallyHidden>{t('results', { count: items.length })}</VisuallyHidden>;
  }

  return (
    <div className={styles.search} role="search">
      <label {...getLabelProps({ className: showLabel ? styles.label : styles.hiddenLabel })}>
        {name}
      </label>
      <div className={styles.inputRow}>
        <span className={styles.leadingIcon}>
          {loading ? <Spinner size={20} /> : <Search size={20} />}
        </span>
        <input
          {...getInputProps({
            // Downshift reports typing from an effect, after React has put the old
            // controlled value back: fast typing would lose keys without this.
            onChange: (event: ChangeEvent<HTMLInputElement>) => setText(event.currentTarget.value),
            onKeyDown: handleKeyDown,
            className: styles.input,
            placeholder: name,
            type: 'text',
            enterKeyHint: 'search',
            autoComplete: 'off',
            autoCapitalize: 'none',
            spellCheck: false,
            maxLength: LIMITS.SEARCH_Q_MAX,
            'aria-busy': loading || undefined,
          })}
        />
        {text === '' ? null : (
          <IconButton
            className={styles.clear}
            label={t('clear')}
            icon={<X size={20} />}
            onClick={clear}
          />
        )}
      </div>
      <ul
        {...getMenuProps({ className: styles.menu, 'aria-label': name })}
        hidden={items.length === 0}
      >
        {items.map((item, index) => (
          <li
            key={item.key}
            {...getItemProps({ item, index, className: styles.option })}
            data-highlighted={highlightedIndex === index || undefined}
          >
            <span className={styles.optionName}>{item.name}</span>
            <span className={styles.optionLabel}>{item.label}</span>
          </li>
        ))}
      </ul>
      <div className={styles.status} role="status">
        {statusText()}
      </div>
      {failure === null ? null : (
        <Button className={styles.retry} onClick={retry}>
          {tCommon('actions.retry')}
        </Button>
      )}
    </div>
  );
}
