import { screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { renderWithIntl } from '@/test-utils/render';
import { ChipRow, type Chip } from './chip-row';

type Day = 'ideas' | 'all' | 'd1' | 'd2';

const DAYS: Chip<Day>[] = [
  { id: 'ideas', label: 'Ideas' },
  { id: 'all', label: 'All' },
  { id: 'd1', label: 'Day 1', swatch: 'var(--day-1)' },
  { id: 'd2', label: 'Day 2', swatch: 'var(--day-2)' },
];

function DayChips({ selected, onSelect }: { selected?: Day; onSelect?: (day: Day) => void }) {
  const [day, setDay] = useState<Day>('ideas');
  return (
    <ChipRow
      label="Days"
      chips={DAYS}
      selectedId={selected ?? day}
      onSelect={(next) => {
        onSelect?.(next);
        setDay(next);
      }}
      trailing={
        <button type="button" aria-label="New day">
          +
        </button>
      }
    />
  );
}

let scrollIntoView: Mock<Element['scrollIntoView']>;

beforeEach(() => {
  installFakeMatchMedia();
  // jsdom does not scroll.
  scrollIntoView = vi.fn<Element['scrollIntoView']>();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});

describe('ChipRow', () => {
  it('is_a_named_group_of_toggle_chips_with_one_pressed', () => {
    renderWithIntl(<DayChips />);

    expect(screen.getByRole('group', { name: 'Days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ideas', pressed: true })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { pressed: false }).map((chip) => chip.textContent),
    ).toEqual(['All', 'Day 1', 'Day 2']);
    expect(screen.getByRole('button', { name: 'New day' })).toBeInTheDocument();
  });

  it('selects_a_chip_on_tap', async () => {
    const onSelect = vi.fn();
    const { user } = renderWithIntl(<DayChips onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Day 2' }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('d2');
    expect(screen.getByRole('button', { name: 'Day 2', pressed: true })).toBeInTheDocument();
  });

  it('scrolls_the_selected_chip_into_view_when_the_selection_changes_from_outside', () => {
    const { rerender } = renderWithIntl(<DayChips selected="ideas" />);
    scrollIntoView.mockClear();

    rerender(<DayChips selected="d2" />);

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('button', { name: 'Day 2' }));
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  });
});
