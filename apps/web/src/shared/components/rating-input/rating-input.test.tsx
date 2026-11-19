import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { RatingInput } from './rating-input';

const optionLabel = (value: number) => (value === 1 ? '1 star' : `${value} stars`);

function Rating({
  initial = null,
  onChange = vi.fn(),
  error,
}: {
  initial?: number | null;
  onChange?: (value: number) => void;
  error?: string;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <RatingInput
      legend="Rating"
      hint="Required"
      optionLabel={optionLabel}
      value={value}
      error={error}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('RatingInput', () => {
  it('is_a_named_group_of_five_star_radios', () => {
    renderWithIntl(<Rating />);

    expect(screen.getByRole('radiogroup', { name: 'Rating' })).toHaveAccessibleDescription(
      'Required',
    );
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      '1 star',
      '2 stars',
      '3 stars',
      '4 stars',
      '5 stars',
    ]);
    expect(
      screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked),
    ).toEqual([]);
  });

  it('picks_a_rating_on_tap', async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<Rating onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: '4 stars' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked();
  });

  it('changes_the_rating_with_arrow_keys', async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<Rating initial={3} onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole('radio', { name: '3 stars' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');

    expect(onChange.mock.calls).toEqual([[4], [3], [2]]);
    expect(screen.getByRole('radio', { name: '2 stars' })).toBeChecked();
  });

  it('wires_the_error_per_L11', () => {
    renderWithIntl(<Rating error="Choose a rating" />);

    expect(screen.getByRole('radiogroup', { name: 'Rating' })).toHaveAccessibleDescription(
      'Required Choose a rating',
    );
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a rating');
  });
});
