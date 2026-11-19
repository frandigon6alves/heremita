import { screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { renderWithIntl } from '@/test-utils/render';
import { DragHandle } from './drag-handle';
import { SortableList, type SortableAnnouncements, type SortableMove } from './sortable-list';

type Stop = 'castle' | 'tram' | 'museum';

const NAMES: Record<Stop, string> = { castle: 'Castle', tram: 'Tram 28', museum: 'Museum' };
const ROW_HEIGHT = 56;

const announcements: SortableAnnouncements<Stop> = {
  instructions: 'Press Space to pick up, arrows to move, Space to drop.',
  roleDescription: 'movable',
  pickedUp: (id, position, total) => `Picked up ${NAMES[id]}, ${position} of ${total}`,
  movedTo: (id, position, total) => `${NAMES[id]} moved to ${position} of ${total}`,
  dropped: (id, position, total) => `${NAMES[id]} dropped at ${position} of ${total}`,
  cancelled: (id) => `Move of ${NAMES[id]} cancelled`,
};

function Stops({
  onMove = vi.fn(),
  disabled = false,
}: {
  onMove?: (move: SortableMove<Stop>) => void;
  disabled?: boolean;
}) {
  const [order, setOrder] = useState<Stop[]>(['castle', 'tram', 'museum']);
  return (
    <SortableList
      items={order}
      label="Day 1 stops"
      announcements={announcements}
      disabled={disabled}
      onMove={(move) => {
        onMove(move);
        setOrder(move.order);
      }}
      renderItem={(id) => (
        <>
          <DragHandle label={`Move ${NAMES[id]}`} />
          <span>{NAMES[id]}</span>
        </>
      )}
    />
  );
}

/** jsdom lays nothing out: give each row a 56 px slot by its place in the list. */
function layOutRows() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(
    this: HTMLElement,
  ) {
    const row = this.closest('li');
    const index = row?.parentElement ? Array.from(row.parentElement.children).indexOf(row) : 0;
    const top = index * ROW_HEIGHT;
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      width: 320,
      height: ROW_HEIGHT,
      right: 320,
      bottom: top + ROW_HEIGHT,
      toJSON: () => ({}),
    };
  });
}

function liveRegion() {
  const region = document.querySelector('[id^="DndLiveRegion"]');
  if (region === null) {
    throw new Error('dnd-kit live region missing');
  }
  return region;
}

function rowNames() {
  return screen.getAllByRole('listitem').map((row) => row.textContent);
}

beforeEach(() => {
  installFakeMatchMedia();
  layOutRows();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SortableList', () => {
  it('renders_rows_in_order_inside_a_named_list', () => {
    renderWithIntl(<Stops />);

    expect(screen.getByRole('list', { name: 'Day 1 stops' })).toBeInTheDocument();
    expect(rowNames()).toEqual(['Castle', 'Tram 28', 'Museum']);
  });

  it('names_each_handle_and_describes_the_keyboard_path_in_the_viewer_language', () => {
    renderWithIntl(<Stops />);

    const handle = screen.getByRole('button', { name: 'Move Tram 28' });
    expect(handle).toHaveAccessibleDescription(
      'Press Space to pick up, arrows to move, Space to drop.',
    );
    expect(handle).toHaveAttribute('aria-roledescription', 'movable');
  });

  it('moves_a_row_down_with_space_arrow_space_and_announces_each_step', async () => {
    const onMove = vi.fn();
    const { user } = renderWithIntl(
      <StrictMode>
        <Stops onMove={onMove} />
      </StrictMode>,
    );
    const handle = screen.getByRole('button', { name: 'Move Castle' });
    handle.focus();

    await user.keyboard(' ');
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Picked up Castle, 1 of 3'));
    await waitFor(async () => {
      await user.keyboard('{ArrowDown}');
      expect(liveRegion()).toHaveTextContent('Castle moved to 2 of 3');
    });
    await user.keyboard(' ');

    await waitFor(() => expect(liveRegion()).toHaveTextContent('Castle dropped at 2 of 3'));
    expect(onMove).toHaveBeenCalledExactlyOnceWith({
      id: 'castle',
      from: 0,
      to: 1,
      order: ['tram', 'castle', 'museum'],
    });
    expect(rowNames()).toEqual(['Tram 28', 'Castle', 'Museum']);
    expect(screen.getByRole('button', { name: 'Move Castle' })).toHaveFocus();
  });

  it('keeps_the_order_when_the_drag_is_cancelled_with_escape', async () => {
    const onMove = vi.fn();
    const { user } = renderWithIntl(<Stops onMove={onMove} />);
    screen.getByRole('button', { name: 'Move Museum' }).focus();

    await user.keyboard(' ');
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Picked up Museum, 3 of 3'));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(liveRegion()).toHaveTextContent('Move of Museum cancelled'));
    expect(onMove).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(['Castle', 'Tram 28', 'Museum']);
  });

  it('marks_handles_disabled_and_ignores_them_when_disabled', async () => {
    const { user } = renderWithIntl(<Stops disabled />);
    const handle = screen.getByRole('button', { name: 'Move Castle' });
    handle.focus();

    await user.keyboard(' ');

    expect(handle).toHaveAttribute('aria-disabled', 'true');
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it('refuses_a_handle_outside_a_list', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderWithIntl(<DragHandle label="Move" />)).toThrow(
      'DragHandle must be rendered inside a SortableList row.',
    );
  });
});
