import { act, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { ConfirmDialog } from './confirm-dialog';
import { Dialog } from './dialog';

function DeleteTrip({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete trip
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete Lisbon on foot?"
        confirmLabel="Delete trip"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
      >
        <p>Its days, places and notes are deleted for good.</p>
      </ConfirmDialog>
    </>
  );
}

describe('ConfirmDialog', () => {
  it('opens_as_a_modal_named_by_its_title', async () => {
    const { user } = renderWithIntl(<DeleteTrip />);

    await user.click(screen.getByRole('button', { name: 'Delete trip' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete Lisbon on foot?' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveTextContent('Its days, places and notes are deleted for good.');
  });

  it('focuses_cancel_first_so_enter_never_destroys', async () => {
    const { user } = renderWithIntl(<DeleteTrip />);

    await user.click(screen.getByRole('button', { name: 'Delete trip' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('returns_focus_to_the_invoker_on_cancel', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithIntl(<DeleteTrip onConfirm={onConfirm} />);
    const invoker = screen.getByRole('button', { name: 'Delete trip' });

    await user.click(invoker);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(invoker).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('runs_the_action_and_returns_focus_on_confirm', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithIntl(<DeleteTrip onConfirm={onConfirm} />);
    const invoker = screen.getByRole('button', { name: 'Delete trip' });

    await user.click(invoker);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(dialog).not.toHaveAttribute('open');
    expect(invoker).toHaveFocus();
  });

  it('asks_the_parent_to_close_on_escape', async () => {
    const { user } = renderWithIntl(<DeleteTrip />);
    await user.click(screen.getByRole('button', { name: 'Delete trip' }));
    const dialog = screen.getByRole('dialog');

    // The browser turns Escape into a `cancel` event on the open modal (jsdom does not).
    const cancel = new Event('cancel', { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancel);
    });

    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('keeps_both_buttons_waiting_while_busy', () => {
    renderWithIntl(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        title="Delete account?"
        confirmLabel="Delete account"
        onConfirm={vi.fn()}
        busy
      >
        <p>Public trips and reviews disappear.</p>
      </ConfirmDialog>,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete account' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Delete account' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});

describe('Dialog', () => {
  it('tells_the_parent_when_the_browser_closed_it', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Dialog open onClose={onClose} title="Report">
        <p>Why?</p>
      </Dialog>,
    );

    await act(async () => {
      screen.getByRole<HTMLDialogElement>('dialog').close();
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays_open_when_it_first_renders_open_under_strict_mode', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <StrictMode>
        <Dialog open onClose={onClose} title="Report">
          <p>Why?</p>
        </Dialog>
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Why?');
  });

  it('focuses_the_first_marked_control', () => {
    renderWithIntl(
      <Dialog open onClose={vi.fn()} title="Delete account">
        <label>
          Password <input data-initial-focus="" type="password" />
        </label>
      </Dialog>,
    );

    expect(screen.getByLabelText('Password')).toHaveFocus();
  });
});
