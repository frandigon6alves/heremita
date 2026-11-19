'use client';

import { useCombobox } from 'downshift';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { controlClassName, Field } from '../field/field';
import styles from './combobox.module.css';

export interface ComboboxProps<T> extends Pick<
  ComponentProps<'input'>,
  'name' | 'placeholder' | 'disabled' | 'enterKeyHint' | 'onBlur' | 'autoFocus'
> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Suggestions for the current text; the caller fetches or filters them. */
  items: readonly T[];
  /** Stable id of a suggestion (React key and highlighted-option identity). */
  itemToKey: (item: T) => string;
  /** Text written into the field when the suggestion is chosen. */
  itemToString: (item: T) => string;
  /** Option content; defaults to `itemToString`. */
  renderItem?: (item: T) => ReactNode;
  /** The typed text (controlled: the caller debounces and queries with it). */
  inputValue: string;
  onInputValueChange: (value: string) => void;
  /** Enter on the highlighted option, or a click/tap on any option. */
  onSelect: (item: T) => void;
  /** Shown in the popup in place of (or under) the options: searching, no results, error + Retry. */
  status?: ReactNode;
}

/**
 * Text field with a suggestion popup (downshift `useCombobox`): typing opens
 * it, arrows move the highlight (`aria-activedescendant`, focus stays in the
 * field), Enter or a tap picks, Escape closes. Free text stays allowed: Enter
 * with nothing highlighted submits the surrounding form as usual.
 */
export function Combobox<T>({
  label,
  hint,
  error,
  items,
  itemToKey,
  itemToString,
  renderItem = itemToString,
  inputValue,
  onInputValueChange,
  onSelect,
  status,
  ...inputProps
}: ComboboxProps<T>) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const labelId = `${baseId}-label`;

  const { isOpen, highlightedIndex, getInputProps, getMenuProps, getItemProps } = useCombobox<T>({
    items: [...items],
    inputId,
    labelId,
    inputValue,
    // Always "nothing selected", so picking the same place twice still reports it.
    selectedItem: null,
    itemToString: (item) => (item === null ? '' : itemToString(item)),
    itemToKey: (item) => (item === null ? null : itemToKey(item)),
    onInputValueChange: ({ inputValue: next }) => onInputValueChange(next),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem !== null) {
        onSelect(selectedItem);
      }
    },
  });

  const hasStatus = status !== undefined && status !== null && status !== false;
  const popupVisible = isOpen && (items.length > 0 || hasStatus);

  return (
    <Field label={<span id={labelId}>{label}</span>} hint={hint} error={error} id={inputId}>
      {(control) => (
        <div className={styles.combobox}>
          <input
            {...getInputProps({
              ...inputProps,
              'aria-describedby': control['aria-describedby'],
              'aria-invalid': control['aria-invalid'],
              className: controlClassName,
              type: 'text',
              autoCapitalize: 'none',
              spellCheck: false,
            })}
          />
          <div className={styles.popup} hidden={!popupVisible}>
            <ul {...getMenuProps({ className: styles.options })}>
              {isOpen
                ? items.map((item, index) => (
                    <li
                      key={itemToKey(item)}
                      className={
                        highlightedIndex === index
                          ? `${styles.option} ${styles.highlighted}`
                          : styles.option
                      }
                      {...getItemProps({ item, index })}
                    >
                      {renderItem(item)}
                    </li>
                  ))
                : null}
            </ul>
            {hasStatus ? <div className={styles.status}>{status}</div> : null}
          </div>
        </div>
      )}
    </Field>
  );
}
