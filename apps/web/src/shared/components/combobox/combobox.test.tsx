import { screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { Combobox } from './combobox';

interface Place {
  id: string;
  name: string;
  label: string;
}

const PLACES: Place[] = [
  { id: 'p1', name: 'Lisboa', label: 'Portugal' },
  { id: 'p2', name: 'Lisbon Oceanarium', label: 'Lisboa, Portugal' },
  { id: 'p3', name: 'Paris', label: 'France' },
];

function Destination({
  onSelect = vi.fn(),
  error,
  status,
}: {
  onSelect?: (place: Place) => void;
  error?: string;
  status?: string;
}) {
  const [text, setText] = useState('');
  const items = text.length < 2 ? [] : PLACES.filter((place) => place.name.startsWith(text));
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <Combobox
        label="Destination"
        hint="City or region"
        error={error}
        items={items}
        itemToKey={(place) => place.id}
        itemToString={(place) => place.name}
        renderItem={(place) => (
          <span>
            {place.name} · {place.label}
          </span>
        )}
        inputValue={text}
        onInputValueChange={setText}
        onSelect={onSelect}
        status={status}
      />
    </form>
  );
}

describe('Combobox', () => {
  it('is_a_named_combobox_described_by_its_hint', () => {
    renderWithIntl(<Destination />);

    const input = screen.getByRole('combobox', { name: 'Destination' });
    expect(input).toHaveAccessibleDescription('City or region');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('lists_suggestions_for_the_typed_text', async () => {
    const { user } = renderWithIntl(
      <StrictMode>
        <Destination />
      </StrictMode>,
    );

    await user.type(screen.getByRole('combobox'), 'Lis');

    const listbox = screen.getByRole('listbox', { name: 'Destination' });
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Lisboa · Portugal', 'Lisbon Oceanarium · Lisboa, Portugal']);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  it('moves_the_highlight_with_arrows_while_focus_stays_in_the_field', async () => {
    const { user } = renderWithIntl(<Destination />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'Lis');
    await user.keyboard('{ArrowDown}{ArrowDown}');

    const highlighted = screen.getByRole('option', {
      name: 'Lisbon Oceanarium · Lisboa, Portugal',
    });
    expect(input).toHaveAttribute('aria-activedescendant', highlighted.id);
    expect(highlighted).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();
  });

  it('picks_the_highlighted_suggestion_on_enter_and_closes', async () => {
    const onSelect = vi.fn();
    const { user } = renderWithIntl(<Destination onSelect={onSelect} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'Lis');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(PLACES[0]);
    expect(input).toHaveValue('Lisboa');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('picks_a_suggestion_on_tap', async () => {
    const onSelect = vi.fn();
    const { user } = renderWithIntl(<Destination onSelect={onSelect} />);

    await user.type(screen.getByRole('combobox'), 'Par');
    await user.click(screen.getByRole('option', { name: 'Paris · France' }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(PLACES[2]);
    expect(screen.getByRole('combobox')).toHaveValue('Paris');
  });

  it('reports_the_same_suggestion_again_when_picked_twice', async () => {
    const onSelect = vi.fn();
    const { user } = renderWithIntl(<Destination onSelect={onSelect} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'Par');
    await user.click(screen.getByRole('option', { name: 'Paris · France' }));
    await user.clear(input);
    await user.type(input, 'Par');
    await user.click(screen.getByRole('option', { name: 'Paris · France' }));

    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('closes_on_escape_without_picking', async () => {
    const onSelect = vi.fn();
    const { user } = renderWithIntl(<Destination onSelect={onSelect} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'Lis');
    await user.keyboard('{Escape}');

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows_the_status_when_there_are_no_suggestions', async () => {
    const { user } = renderWithIntl(<Destination status="No places for “Fiji”" />);

    await user.type(screen.getByRole('combobox'), 'Fiji');

    expect(screen.getByText('No places for “Fiji”')).toBeVisible();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('wires_the_field_error_per_L11', () => {
    renderWithIntl(<Destination error="Choose a destination" />);

    const input = screen.getByRole('combobox', { name: 'Destination' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('City or region Choose a destination');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a destination');
  });
});
