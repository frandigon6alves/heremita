import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteChrome } from './site-chrome';

interface Route {
  segments: string[];
  params: Record<string, string>;
}

const route = vi.hoisted((): Route => ({ segments: [], params: {} }));
vi.mock('next/navigation', () => ({
  useSelectedLayoutSegments: () => route.segments,
  useParams: () => route.params,
}));

function renderAt(segments: string[], params: Record<string, string>) {
  route.segments = segments;
  route.params = { locale: 'en', ...params };
  render(
    <SiteChrome header={<header>Site header</header>} footer={<footer>Site footer</footer>}>
      <main>Page</main>
    </SiteChrome>,
  );
}

const chrome = () => [screen.queryByText('Site header'), screen.queryByText('Site footer')];

afterEach(() => {
  route.segments = [];
  route.params = {};
});

describe('SiteChrome', () => {
  it('frames_a_site_page_with_the_header_and_footer', () => {
    renderAt(['(public)', 'explore'], {});

    expect(chrome()).toEqual([expect.anything(), expect.anything()]);
    expect(screen.getByText('Page')).toBeInTheDocument();
  });

  it('leaves_the_planner_to_its_own_app_bar', () => {
    renderAt(['(app)', 'trips', 'trip-1'], { tripId: 'trip-1' });

    expect(chrome()).toEqual([null, null]);
    expect(screen.getByText('Page')).toBeInTheDocument();
  });

  it('frames_the_settings_of_a_trip', () => {
    renderAt(['(app)', 'trips', 'trip-1', 'settings'], { tripId: 'trip-1' });

    expect(chrome()).toEqual([expect.anything(), expect.anything()]);
  });

  it('leaves_a_public_trip_to_its_own_app_bar', () => {
    renderAt(['(public)', 't', 'trip-1'], { tripId: 'trip-1' });

    expect(chrome()).toEqual([null, null]);
  });

  it('leaves_a_shared_trip_to_its_own_app_bar', () => {
    renderAt(['(public)', 's', 'token-1'], { shareToken: 'token-1' });

    expect(chrome()).toEqual([null, null]);
  });

  it('frames_the_not_found_page_of_an_unknown_path', () => {
    renderAt(['nowhere'], {});

    expect(chrome()).toEqual([expect.anything(), expect.anything()]);
  });
});
