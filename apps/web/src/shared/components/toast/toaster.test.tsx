import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { announce, DEFAULT_TOAST_DURATION_MS, resetToasts, showToast } from './toast-store';
import { Toaster } from './toaster';

function liveRegion(): HTMLElement {
  return screen.getByRole('status');
}

describe('Toaster', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    act(() => resetToasts());
    vi.useRealTimers();
  });

  function renderToaster() {
    return renderWithIntl(<Toaster />, {
      userOptions: { advanceTimers: (ms) => vi.advanceTimersByTime(ms) },
    });
  }

  it('renders_one_polite_live_region_and_no_toast_list_at_rest', () => {
    renderToaster();

    expect(liveRegion()).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion()).toBeEmptyDOMElement();
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('shows_and_announces_a_toast', () => {
    renderToaster();

    act(() => {
      showToast({ message: 'Added to Day 2' });
    });

    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(within(region).getByText('Added to Day 2')).toBeVisible();
    expect(liveRegion()).toHaveTextContent('Added to Day 2');
  });

  it('announces_without_a_toast', () => {
    renderToaster();

    act(() => {
      announce('Moved to position 3 of 5');
    });

    expect(liveRegion()).toHaveTextContent('Moved to position 3 of 5');
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('runs_the_action_once_and_dismisses', async () => {
    const undo = vi.fn();
    const { user } = renderToaster();
    act(() => {
      showToast({ message: 'Removed from Day 2', action: { label: 'Undo', onAction: undo } });
    });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Removed from Day 2', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('dismisses_on_the_close_button', async () => {
    const { user } = renderToaster();
    act(() => {
      showToast({ message: 'Link copied' });
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('hides_itself_after_its_duration', () => {
    renderToaster();
    act(() => {
      showToast({ message: 'Link copied' });
    });

    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS - 1);
    });
    expect(screen.getByText('Link copied', { selector: 'p' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Link copied', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('stays_while_focus_is_inside_it', async () => {
    const { user } = renderToaster();
    act(() => {
      showToast({ message: 'Order optimised', action: { label: 'Undo', onAction: vi.fn() } });
    });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 2);
    });

    expect(screen.getByText('Order optimised', { selector: 'p' })).toBeInTheDocument();
  });

  it('keeps_a_persistent_toast_until_dismissed', () => {
    renderToaster();
    act(() => {
      showToast({ message: 'Route unavailable', durationMs: null });
    });

    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 10);
    });

    expect(screen.getByText('Route unavailable', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows_at_most_the_three_latest_toasts', () => {
    renderToaster();

    act(() => {
      for (const message of ['One', 'Two', 'Three', 'Four']) {
        showToast({ message });
      }
    });

    const items = within(screen.getByRole('region', { name: 'Notifications' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Two',
      'Three',
      'Four',
    ]);
    expect(liveRegion()).toHaveTextContent('Four');
  });
});
