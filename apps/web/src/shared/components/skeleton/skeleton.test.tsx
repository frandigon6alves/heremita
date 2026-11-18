import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { Skeleton, SKELETON_DELAY_MS, SkeletonBlock } from './skeleton';

function shapes(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-visible]');
  if (element === null) {
    throw new Error('no skeleton shapes');
  }
  return element;
}

describe('Skeleton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reserves_its_space_but_stays_hidden_before_the_delay', () => {
    const { container } = renderWithIntl(
      <Skeleton>
        <SkeletonBlock height="72px" />
      </Skeleton>,
    );

    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });

    expect(shapes(container)).toHaveAttribute('data-visible', 'false');
    expect(shapes(container).firstElementChild).toHaveStyle({ height: '72px' });
  });

  it('shows_the_shapes_after_the_delay', () => {
    const { container } = renderWithIntl(
      <Skeleton>
        <SkeletonBlock shape="text" />
      </Skeleton>,
    );

    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });

    expect(shapes(container)).toHaveAttribute('data-visible', 'true');
  });

  it('is_read_as_loading_and_hides_the_shapes_from_assistive_technology', () => {
    const { container } = renderWithIntl(
      <Skeleton>
        <SkeletonBlock />
      </Skeleton>,
      { locale: 'pt-BR' },
    );

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(shapes(container)).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('reads_a_custom_label', () => {
    renderWithIntl(
      <Skeleton label="Loading your trips">
        <SkeletonBlock />
      </Skeleton>,
    );

    expect(screen.getByText('Loading your trips')).toBeInTheDocument();
  });

  it('sizes_a_circle_from_its_height', () => {
    const { container } = renderWithIntl(
      <Skeleton>
        <SkeletonBlock shape="circle" height="44px" />
      </Skeleton>,
    );

    expect(shapes(container).firstElementChild).toHaveStyle({ width: '44px', height: '44px' });
  });
});
