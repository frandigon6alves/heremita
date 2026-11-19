import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestIntlProvider } from '@/test-utils/render';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { MapView } from './map-view';

describe('MapView with the real MapLibre and no WebGL (jsdom)', () => {
  it('catches_the_gpu_error_and_keeps_the_page_usable', () => {
    installFakeMatchMedia();

    const { container } = render(
      <TestIntlProvider locale="en">
        <MapView initialView={{ center: [-9.14, 38.71], zoom: 12 }} />
        <ol aria-label="Day 1">
          <li>Belém Tower</li>
        </ol>
      </TestIntlProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The map cannot be shown in this browser. Every place is still in the list.',
    );
    expect(container.querySelector('[data-map-state]')).toHaveAttribute('data-map-state', 'failed');
    expect(screen.getByRole('list', { name: 'Day 1' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
