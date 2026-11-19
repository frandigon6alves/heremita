import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { SegmentedControl } from './segmented-control';

type Mode = 'walk' | 'bike' | 'drive';

const MODES = [
  { value: 'walk', label: 'Walk' },
  { value: 'bike', label: 'Bike' },
  { value: 'drive', label: 'Drive' },
] as const;

function ModeSwitch({
  onChange = vi.fn(),
  disabled = false,
}: {
  onChange?: (mode: Mode) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('walk');
  return (
    <SegmentedControl
      legend="Mode"
      options={MODES}
      value={mode}
      disabled={disabled}
      onChange={(next) => {
        onChange(next);
        setMode(next);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('is_a_named_group_of_radios_with_the_value_checked', () => {
    renderWithIntl(<ModeSwitch />);

    expect(screen.getByRole('group', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Walk' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bike' })).not.toBeChecked();
  });

  it('chooses_on_tap', async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<ModeSwitch onChange={onChange} />);

    await user.click(screen.getByText('Drive'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('drive');
    expect(screen.getByRole('radio', { name: 'Drive' })).toBeChecked();
  });

  it('moves_and_chooses_with_arrow_keys', async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<ModeSwitch onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Walk' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenLastCalledWith('bike');
    expect(screen.getByRole('radio', { name: 'Bike' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Bike' })).toBeChecked();
  });

  it('ignores_input_while_disabled', async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<ModeSwitch onChange={onChange} disabled />);

    await user.click(screen.getByText('Bike'));

    expect(screen.getByRole('radio', { name: 'Bike' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
