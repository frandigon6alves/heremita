'use client';

import { useHydrated } from '@/app/use-hydrated';
import { useCombobox } from 'downshift';
import { StrictMode, useState } from 'react';

const ALL = ['Lisboa', 'Lisbon Oceanarium', 'Paris', 'Porto', 'São Paulo'];

function Combobox() {
  const [items, setItems] = useState(ALL);
  const [picked, setPicked] = useState<string | null>(null);
  const { isOpen, getLabelProps, getInputProps, getMenuProps, getItemProps, highlightedIndex } =
    useCombobox({
      items,
      onInputValueChange: ({ inputValue }) =>
        setItems(ALL.filter((i) => i.toLowerCase().startsWith(inputValue.toLowerCase()))),
      onSelectedItemChange: ({ selectedItem }) => setPicked(selectedItem),
    });
  return (
    <div data-hydrated={useHydrated()}>
      <label {...getLabelProps()}>Search places</label>
      <input {...getInputProps()} />
      <ul {...getMenuProps()}>
        {isOpen &&
          items.map((item, index) => (
            <li
              key={item}
              style={{ background: highlightedIndex === index ? '#def' : undefined }}
              {...getItemProps({ item, index })}
            >
              {item}
            </li>
          ))}
      </ul>
      <p data-testid="picked">{picked ?? '-'}</p>
    </div>
  );
}

export function ComboboxSpike() {
  return (
    <StrictMode>
      <Combobox />
    </StrictMode>
  );
}
