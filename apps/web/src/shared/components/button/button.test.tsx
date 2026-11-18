import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Plus } from '@/shared/icons/icons';
import { renderWithIntl } from '@/test-utils/render';
import { IconButton } from '../icon-button/icon-button';
import { Button } from './button';

describe('Button', () => {
  it('is_a_plain_button_by_default', async () => {
    const onClick = vi.fn<(source: string) => void>();
    const { user } = renderWithIntl(
      <form onSubmit={() => onClick('submitted')}>
        <Button onClick={() => onClick('clicked')}>Save</Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledExactlyOnceWith('clicked');
  });

  it('cannot_be_pressed_while_busy', async () => {
    const onClick = vi.fn();
    const { user } = renderWithIntl(
      <Button type="submit" busy onClick={onClick}>
        Creating…
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Creating…' });

    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('is_named_by_its_label_and_hides_the_icon', () => {
    const { container } = renderWithIntl(<IconButton label="New day" icon={<Plus />} />);

    expect(screen.getByRole('button', { name: 'New day' })).toBeVisible();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
