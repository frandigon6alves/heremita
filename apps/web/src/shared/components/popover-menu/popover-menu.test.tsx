import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Ellipsis } from '@/shared/icons/icons';
import { renderWithIntl } from '@/test-utils/render';
import { PopoverMenu, type PopoverMenuSection } from './popover-menu';

function sections(onMoveUp = vi.fn(), onDelete = vi.fn()): PopoverMenuSection[] {
  return [
    {
      items: [
        { id: 'up', label: 'Move up', onSelect: onMoveUp },
        { id: 'down', label: 'Move down', onSelect: vi.fn(), disabled: true },
      ],
    },
    {
      heading: 'Move to day…',
      items: [
        { id: 'day-1', label: 'Day 1', onSelect: vi.fn(), current: true },
        { id: 'day-2', label: 'Day 2', onSelect: vi.fn() },
      ],
    },
    {
      items: [
        {
          id: 'maps',
          label: 'Google Maps',
          href: 'https://www.google.com/maps/dir/?api=1&travelmode=walking',
        },
        { id: 'delete', label: 'Delete from trip', onSelect: onDelete, tone: 'danger' },
      ],
    },
  ];
}

function popoverOf(trigger: HTMLElement): HTMLElement {
  const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
  if (popover === null) {
    throw new Error('popover missing');
  }
  return popover;
}

let hidePopover: Mock<HTMLElement['hidePopover']>;

beforeEach(() => {
  // jsdom has no Popover API; the browser does the showing, focus return and light dismiss.
  hidePopover = vi.fn<HTMLElement['hidePopover']>();
  HTMLElement.prototype.hidePopover = hidePopover;
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
});

describe('PopoverMenu', () => {
  it('opens_a_native_auto_popover_from_a_named_icon_button', () => {
    renderWithIntl(
      <PopoverMenu trigger={<Ellipsis />} label="Actions for Castle" sections={sections()} />,
    );

    const trigger = screen.getByRole('button', { name: 'Actions for Castle' });
    expect(popoverOf(trigger)).toHaveAttribute('popover', 'auto');
  });

  it('lists_plain_buttons_and_links_never_a_menu_role', () => {
    renderWithIntl(<PopoverMenu trigger="Day: Ideas" sections={sections()} />);

    const popover = within(popoverOf(screen.getByRole('button', { name: 'Day: Ideas' })));
    expect(popover.queryByRole('menu', { hidden: true })).not.toBeInTheDocument();
    expect(popover.queryByRole('menuitem', { hidden: true })).not.toBeInTheDocument();
    expect(popover.getByRole('button', { name: 'Move up', hidden: true })).toBeInTheDocument();
    expect(popover.getByRole('link', { name: 'Google Maps', hidden: true })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  it('runs_the_chosen_action_and_closes_the_popover', async () => {
    const onMoveUp = vi.fn();
    const { user } = renderWithIntl(
      <PopoverMenu trigger={<Ellipsis />} label="Actions" sections={sections(onMoveUp)} />,
    );
    const popover = within(popoverOf(screen.getByRole('button', { name: 'Actions' })));

    await user.click(popover.getByRole('button', { name: 'Move up', hidden: true }));

    expect(onMoveUp).toHaveBeenCalledOnce();
    expect(hidePopover).toHaveBeenCalledOnce();
  });

  it('groups_a_titled_section_and_marks_the_current_choice', () => {
    renderWithIntl(<PopoverMenu trigger="Day: Ideas" sections={sections()} />);

    const popover = within(popoverOf(screen.getByRole('button', { name: 'Day: Ideas' })));
    const days = popover.getByRole('list', { name: 'Move to day…', hidden: true });
    expect(within(days).getByRole('button', { name: 'Day 1', hidden: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(days).getByRole('button', { name: 'Day 2', hidden: true })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps_disabled_entries_inert', async () => {
    const { user } = renderWithIntl(<PopoverMenu trigger="More" sections={sections()} />);
    const popover = within(popoverOf(screen.getByRole('button', { name: 'More' })));
    const moveDown = popover.getByRole('button', { name: 'Move down', hidden: true });

    await user.click(moveDown);

    expect(moveDown).toBeDisabled();
    expect(hidePopover).not.toHaveBeenCalled();
  });

  it('disables_the_trigger_when_disabled', () => {
    renderWithIntl(<PopoverMenu trigger="More" sections={sections()} disabled />);

    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled();
  });
});
