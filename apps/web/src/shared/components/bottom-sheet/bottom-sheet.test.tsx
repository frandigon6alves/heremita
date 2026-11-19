import { act, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { renderWithIntl } from '@/test-utils/render';
import { BottomSheet, type Snap } from './bottom-sheet';

const SNAP_NAMES: Record<Snap, string> = {
  peek: 'collapsed',
  half: 'half height',
  full: 'full height',
};
const MIN_HEIGHT = 136;
const MAX_HEIGHT = 704;
// jsdom's window is 1024 × 768: half = 384.
const HEIGHT_OF: Record<Snap, number> = { peek: MIN_HEIGHT, half: 384, full: MAX_HEIGHT };

function Planner({
  initialSnap = 'half',
  variant = 'sheet',
  onSnapSettled = vi.fn(),
  onChip = vi.fn(),
}: {
  initialSnap?: Snap;
  variant?: 'sheet' | 'panel';
  onSnapSettled?: (height: number) => void;
  onChip?: () => void;
}) {
  const [snap, setSnap] = useState<Snap>(initialSnap);
  return (
    <>
      <BottomSheet
        variant={variant}
        snap={snap}
        onSnapChange={setSnap}
        onSnapSettled={onSnapSettled}
        labelledBy="sheet-title"
        handleLabel={(current, next) =>
          `Panel: ${SNAP_NAMES[current]}. ${next === 'peek' || (current === 'full' && next === 'half') ? 'Collapse' : 'Expand'}`
        }
        header={
          <>
            <h2 id="sheet-title">Lisbon on foot</h2>
            <button type="button" onClick={onChip}>
              Day 1
            </button>
          </>
        }
      >
        <button type="button">Castle</button>
      </BottomSheet>
      <button type="button">Add here</button>
    </>
  );
}

function sheet() {
  return screen.getByRole('region', { name: 'Lisbon on foot' });
}

/**
 * jsdom has no CSS layout: the sheet's CSS limits and its height per snap (or
 * drag), or a fixed `frozenHeight` for a height transition that has not moved yet.
 */
function layOutSheet(frozenHeight?: number) {
  const region = sheet();
  region.style.minHeight = `${MIN_HEIGHT}px`;
  region.style.maxHeight = `${MAX_HEIGHT}px`;
  vi.spyOn(region, 'getBoundingClientRect').mockImplementation(() => {
    const snap = region.dataset.snap as Snap;
    const height = frozenHeight ?? (Number.parseFloat(region.style.height) || HEIGHT_OF[snap]);
    return {
      height,
      width: 360,
      x: 0,
      y: 768 - height,
      top: 768 - height,
      left: 0,
      right: 360,
      bottom: 768,
      toJSON: () => ({}),
    };
  });
}

let media: ReturnType<typeof installFakeMatchMedia>;

beforeEach(() => {
  media = installFakeMatchMedia();
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BottomSheet', () => {
  it('is_a_region_named_by_its_heading_with_a_handle_stating_the_snap', () => {
    renderWithIntl(<Planner />);

    expect(sheet()).toHaveAttribute('data-snap', 'half');
    expect(screen.getByRole('button', { name: 'Panel: half height. Expand' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cycles_peek_half_full_half_peek_with_enter_on_the_handle', async () => {
    const { user } = renderWithIntl(<Planner initialSnap="peek" />);
    const handle = screen.getByRole('button', { name: 'Panel: collapsed. Expand' });
    handle.focus();

    const seen: string[] = [];
    for (let press = 0; press < 4; press += 1) {
      await user.keyboard('{Enter}');
      seen.push(`${sheet().dataset.snap} / ${handle.getAttribute('aria-label')}`);
    }

    expect(seen).toEqual([
      'half / Panel: half height. Expand',
      'full / Panel: full height. Collapse',
      'half / Panel: half height. Collapse',
      'peek / Panel: collapsed. Expand',
    ]);
    expect(handle).toHaveFocus();
  });

  it('does_not_trap_focus_so_tab_reaches_the_map_controls', async () => {
    const { user } = renderWithIntl(<Planner />);
    screen.getByRole('button', { name: 'Castle' }).focus();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Add here' })).toHaveFocus();
  });

  it('snaps_to_full_when_the_header_is_dragged_up_and_reports_the_settled_height', async () => {
    media.set('(prefers-reduced-motion: reduce)', true);
    const onSnapSettled = vi.fn();
    const { user } = renderWithIntl(<Planner onSnapSettled={onSnapSettled} />);
    layOutSheet();
    const title = screen.getByRole('heading', { name: 'Lisbon on foot' });

    await user.pointer([
      { keys: '[TouchA>]', target: title, coords: { clientY: 400 } },
      { pointerName: 'TouchA', target: title, coords: { clientY: 250 } },
      { pointerName: 'TouchA', target: title, coords: { clientY: 100 } },
      { keys: '[/TouchA]', target: title, coords: { clientY: 100 } },
    ]);

    expect(sheet()).toHaveAttribute('data-snap', 'full');
    expect(sheet().style.height).toBe('');
    expect(onSnapSettled).toHaveBeenLastCalledWith(MAX_HEIGHT);
  });

  it('snaps_to_peek_when_the_header_is_dragged_down', async () => {
    const { user } = renderWithIntl(<Planner />);
    layOutSheet();
    const title = screen.getByRole('heading', { name: 'Lisbon on foot' });

    await user.pointer([
      { keys: '[TouchA>]', target: title, coords: { clientY: 400 } },
      { pointerName: 'TouchA', target: title, coords: { clientY: 520 } },
      { pointerName: 'TouchA', target: title, coords: { clientY: 700 } },
      { keys: '[/TouchA]', target: title, coords: { clientY: 700 } },
    ]);

    expect(sheet()).toHaveAttribute('data-snap', 'peek');
  });

  it('follows_the_finger_while_dragging', async () => {
    const { user } = renderWithIntl(<Planner />);
    layOutSheet();
    const title = screen.getByRole('heading', { name: 'Lisbon on foot' });

    await user.pointer([
      { keys: '[TouchA>]', target: title, coords: { clientY: 400 } },
      { pointerName: 'TouchA', target: title, coords: { clientY: 300 } },
    ]);

    expect(sheet().style.height).toBe('484px');
  });

  it('keeps_a_tap_on_a_header_chip_a_tap_but_swallows_the_click_that_ends_a_drag', async () => {
    const onChip = vi.fn();
    const { user } = renderWithIntl(<Planner onChip={onChip} />);
    layOutSheet();
    const chip = screen.getByRole('button', { name: 'Day 1' });

    await user.click(chip);
    await user.pointer([
      { keys: '[MouseLeft>]', target: chip, coords: { clientY: 400 } },
      { target: chip, coords: { clientY: 330 } },
      { keys: '[/MouseLeft]', target: chip, coords: { clientY: 330 } },
    ]);

    expect(onChip).toHaveBeenCalledOnce();
  });

  it('ignores_moves_shorter_than_the_drag_slop', async () => {
    const { user } = renderWithIntl(<Planner />);
    layOutSheet();
    const title = screen.getByRole('heading', { name: 'Lisbon on foot' });

    await user.pointer([
      { keys: '[TouchA>]', target: title, coords: { clientY: 400 } },
      { pointerName: 'TouchA', target: title, coords: { clientY: 395 } },
      { keys: '[/TouchA]', target: title, coords: { clientY: 395 } },
    ]);

    expect(sheet().style.height).toBe('');
    expect(sheet()).toHaveAttribute('data-snap', 'half');
  });

  it('opens_to_half_when_focus_enters_rows_hidden_below_the_peek_line', () => {
    renderWithIntl(<Planner initialSnap="peek" />);

    act(() => screen.getByRole('button', { name: 'Castle' }).focus());

    expect(sheet()).toHaveAttribute('data-snap', 'half');
  });

  it('lets_the_keyboard_reach_the_scrolling_body_and_opens_to_half', () => {
    renderWithIntl(<Planner initialSnap="peek" />);
    const body = sheet().querySelector<HTMLElement>('[tabindex="0"]');

    act(() => body?.focus());

    expect(body).toHaveFocus();
    expect(sheet()).toHaveAttribute('data-snap', 'half');
  });

  it('reports_the_height_once_the_snap_transition_ends', () => {
    const onSnapSettled = vi.fn();
    renderWithIntl(<Planner initialSnap="peek" onSnapSettled={onSnapSettled} />);
    layOutSheet(HEIGHT_OF.peek);
    onSnapSettled.mockClear();
    const handle = screen.getByRole('button', { name: 'Panel: collapsed. Expand' });

    act(() => handle.click());
    expect(onSnapSettled).not.toHaveBeenCalled();
    const end = Object.assign(new Event('transitionend', { bubbles: true }), {
      propertyName: 'height',
    });
    act(() => {
      sheet().dispatchEvent(end);
    });

    expect(onSnapSettled).toHaveBeenCalledExactlyOnceWith(HEIGHT_OF.half);
  });

  it('renders_a_plain_panel_without_handle_or_snaps_on_wide_screens', () => {
    renderWithIntl(<Planner variant="panel" />);

    expect(sheet()).not.toHaveAttribute('data-snap');
    expect(screen.queryByRole('button', { name: /Panel/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Castle' })).toBeInTheDocument();
  });
});
