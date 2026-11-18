import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppBar } from './app-bar';

describe('AppBar', () => {
  it('renders_a_banner_with_start_title_and_end_slots_in_order', () => {
    render(
      <AppBar start={<button type="button">Back</button>} end={<button type="button">More</button>}>
        <span>Lisbon on foot</span>
      </AppBar>,
    );

    const banner = screen.getByRole('banner');
    expect(banner).toHaveTextContent(/^BackLisbon on footMore$/);
  });

  it('leaves_out_empty_slots', () => {
    render(<AppBar>Heremita</AppBar>);

    expect(screen.getByRole('banner').children).toHaveLength(1);
  });
});
