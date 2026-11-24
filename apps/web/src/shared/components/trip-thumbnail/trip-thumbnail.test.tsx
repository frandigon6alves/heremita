import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPageTheme } from '@/shared/map/testing/render-map';
import { renderWithIntl } from '@/test-utils/render';
import { TripThumbnail } from './trip-thumbnail';

const renderStaticMap = vi.hoisted(() => vi.fn<(request: unknown) => Promise<string>>());
vi.mock('@/shared/map/static-map', () => ({ renderStaticMap }));

const POINTS = [
  { lng: -9.1365, lat: 38.7077 },
  { lng: -9.1335, lat: 38.7139 },
];

afterEach(() => {
  renderStaticMap.mockReset();
  document.documentElement.removeAttribute('data-theme');
});

const picture = (container: HTMLElement) => container.querySelector('img');

describe('TripThumbnail', () => {
  it('sketches_the_route_at_once_and_shows_the_drawn_map_with_its_credit', async () => {
    renderStaticMap.mockResolvedValue('blob:map-1');
    const { container } = renderWithIntl(<TripThumbnail points={POINTS} />);

    expect(container.querySelector('polyline')).not.toBeNull();
    expect(picture(container)).toBeNull();

    await waitFor(() => expect(picture(container)).toHaveAttribute('src', 'blob:map-1'));
    expect(picture(container)).toHaveAttribute('alt', '');
    expect(screen.getByText('Map © OpenStreetMap contributors')).toBeInTheDocument();
    expect(container.querySelector('polyline')).not.toBeNull();
    expect(renderStaticMap).toHaveBeenCalledWith({
      points: [
        [-9.1365, 38.7077],
        [-9.1335, 38.7139],
      ],
      theme: 'light',
      language: 'en',
    });
  });

  it('keeps_the_sketch_when_the_map_cannot_be_drawn', async () => {
    renderStaticMap.mockRejectedValue(new Error('no webgl'));
    const { container } = renderWithIntl(<TripThumbnail points={POINTS} />);

    await waitFor(() => expect(renderStaticMap).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(picture(container)).toBeNull();
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('draws_nothing_for_a_trip_without_places', () => {
    const { container } = renderWithIntl(<TripThumbnail points={[]} />);

    expect(renderStaticMap).not.toHaveBeenCalled();
    expect(container.querySelector('div[aria-hidden="true"] > svg')).not.toBeNull();
  });

  it('labels_the_basemap_in_the_page_language', async () => {
    renderStaticMap.mockResolvedValue('blob:map-pt');
    renderWithIntl(<TripThumbnail points={POINTS} />, { locale: 'pt-BR' });

    await waitFor(() =>
      expect(renderStaticMap).toHaveBeenCalledWith(expect.objectContaining({ language: 'pt' })),
    );
  });

  it('draws_the_map_again_when_the_theme_changes', async () => {
    renderStaticMap.mockResolvedValueOnce('blob:light').mockResolvedValueOnce('blob:dark');
    const { container } = renderWithIntl(<TripThumbnail points={POINTS} />);
    await waitFor(() => expect(picture(container)).toHaveAttribute('src', 'blob:light'));

    await setPageTheme('dark');

    await waitFor(() => expect(picture(container)).toHaveAttribute('src', 'blob:dark'));
    expect(renderStaticMap).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
  });
});
