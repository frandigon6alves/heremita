import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from './match-media.test-support';
import { useMediaQuery } from './use-media-query';
import { useReducedMotion } from './use-reduced-motion';

const DESKTOP = '(min-width: 1024px)';

function Probe() {
  return (
    <p>
      desktop: {String(useMediaQuery(DESKTOP))}, calm: {String(useReducedMotion())}
    </p>
  );
}

let media: ReturnType<typeof installFakeMatchMedia>;

beforeEach(() => {
  media = installFakeMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('reads_the_current_match', () => {
    media.set(DESKTOP, true);

    render(<Probe />);

    expect(screen.getByText('desktop: true, calm: false')).toBeInTheDocument();
  });

  it('rerenders_when_the_query_flips', () => {
    render(<Probe />);

    act(() => media.set(DESKTOP, true));

    expect(screen.getByText('desktop: true, calm: false')).toBeInTheDocument();
  });

  it('stops_listening_on_unmount', () => {
    const { unmount } = render(<Probe />);
    expect(media.listenerCount(DESKTOP)).toBe(1);

    unmount();

    expect(media.listenerCount(DESKTOP)).toBe(0);
  });
});

describe('useReducedMotion', () => {
  it('follows_prefers_reduced_motion', () => {
    render(<Probe />);

    act(() => media.set('(prefers-reduced-motion: reduce)', true));

    expect(screen.getByText('desktop: false, calm: true')).toBeInTheDocument();
  });
});
