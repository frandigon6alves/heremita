import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import { TestIntlProvider } from '@/test-utils/render';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { useMap } from './map-context';
import { MapView, type InitialView } from './map-view';
import {
  AttributionControl,
  createdMaps,
  failNextMap,
  GeolocateControl,
  GPUInitializationError,
  latestMap,
  resetFakeMaps,
} from './testing/fake-maplibre';
import { setPageTheme } from './testing/render-map';

vi.mock('maplibre-gl', () => import('./testing/fake-maplibre'));

const LISBON: InitialView = { center: [-9.14, 38.71], zoom: 12 };

let media: ReturnType<typeof installFakeMatchMedia>;

beforeEach(() => {
  media = installFakeMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetFakeMaps();
  resetToasts();
  document.documentElement.removeAttribute('data-theme');
});

function MapProbe() {
  const { theme, fonts } = useMap();
  return <p>{`map child: ${theme} ${fonts?.join(',') ?? 'no fonts'}`}</p>;
}

function renderMapView(
  props: Partial<Parameters<typeof MapView>[0]> = {},
  locale: 'en' | 'pt-BR' = 'en',
) {
  return render(
    <StrictMode>
      <TestIntlProvider locale={locale}>
        <MapView initialView={LISBON} {...props}>
          <MapProbe />
        </MapView>
      </TestIntlProvider>
    </StrictMode>,
  );
}

const liveMaps = () => createdMaps.filter((map) => !map.removed);
const root = (container: HTMLElement) => container.querySelector('[data-map-state]');

describe('MapView', () => {
  it('keeps_one_live_map_under_strict_mode_double_mount', () => {
    const { container } = renderMapView();

    expect(createdMaps).toHaveLength(2);
    expect(liveMaps()).toHaveLength(1);
    expect(container.querySelectorAll('[data-map-state] > div > div')).toHaveLength(1);
  });

  it('shows_loading_until_the_map_loads_then_renders_its_children', () => {
    const { container } = renderMapView();
    expect(root(container)).toHaveAttribute('data-map-state', 'loading');
    expect(screen.queryByText(/map child/)).not.toBeInTheDocument();

    act(() => latestMap().load());

    expect(root(container)).toHaveAttribute('data-map-state', 'ready');
    expect(screen.getByText('map child: light Noto Sans Bold')).toBeInTheDocument();
  });

  it('creates_a_north_up_map_without_rotation_or_pitch', () => {
    renderMapView();
    const map = latestMap();

    expect(map.options).toMatchObject({
      center: [-9.14, 38.71],
      zoom: 12,
      style: 'https://tiles.openfreemap.org/styles/positron',
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      cooperativeGestures: false,
    });
    expect(map.options.pixelRatio).toBeLessThanOrEqual(2);
    expect(map.touchZoomRotate.rotationDisabled).toBe(true);
  });

  it('starts_from_bounds_with_the_fit_padding', () => {
    renderMapView({
      initialView: {
        bounds: [
          [-9.2, 38.7],
          [-9.1, 38.8],
        ],
      },
    });

    expect(latestMap().options).toMatchObject({
      bounds: [
        [-9.2, 38.7],
        [-9.1, 38.8],
      ],
      fitBoundsOptions: { padding: 24, maxZoom: 16 },
    });
  });

  it('puts_a_compact_attribution_top_left_away_from_the_sheet', () => {
    renderMapView();

    const attribution = latestMap().controls.find(
      ({ control }) => control instanceof AttributionControl,
    );
    expect(attribution?.position).toBe('top-left');
    expect((attribution?.control as AttributionControl).options).toEqual({ compact: true });
  });

  it('translates_the_map_name_and_controls_into_portuguese', () => {
    renderMapView({}, 'pt-BR');

    expect(latestMap().options.locale).toMatchObject({
      'Map.Title': 'Mapa da viagem',
      'NavigationControl.ZoomIn': 'Aproximar',
      'GeolocateControl.FindMyLocation': 'Minha localização',
      'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
    });
  });

  it('names_the_map_region_with_the_given_label', () => {
    renderMapView({ label: 'Map of the Belém tower' });

    expect(latestMap().options.locale).toMatchObject({ 'Map.Title': 'Map of the Belém tower' });
  });

  it('labels_the_basemap_in_the_ui_language', () => {
    renderMapView({}, 'pt-BR');

    expect(latestMap().options.transformStyle).toEqual(expect.any(Function));
  });

  it('uses_cooperative_gestures_for_small_embedded_maps', () => {
    renderMapView({ cooperativeGestures: true });

    expect(latestMap().options.cooperativeGestures).toBe(true);
  });

  it('adds_my_location_only_when_asked_and_reports_its_errors_in_a_toast', () => {
    renderMapView({ geolocate: true });
    const geolocate = latestMap().controls.find(
      ({ control }) => control instanceof GeolocateControl,
    )?.control as GeolocateControl;

    expect(geolocate.options).toMatchObject({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      fitBoundsOptions: { maxZoom: 15 },
    });
    act(() => geolocate.fire('error'));
    expect(getSnapshot().toasts.map(({ message }) => message)).toEqual([
      'Could not find your location. Check the location permission.',
    ]);
  });

  it('has_no_my_location_control_by_default', () => {
    renderMapView();

    expect(latestMap().controls.some(({ control }) => control instanceof GeolocateControl)).toBe(
      false,
    );
  });

  it('starts_dark_when_the_page_is_dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    renderMapView();

    expect(latestMap().options.style).toBe('https://tiles.openfreemap.org/styles/dark');
  });

  it('switches_the_basemap_when_the_theme_changes', async () => {
    renderMapView();
    const map = latestMap();
    act(() => map.load());

    await setPageTheme('dark');

    expect(map.styleCalls.map(({ url }) => url)).toEqual([
      'https://tiles.openfreemap.org/styles/dark',
    ]);
    expect(screen.getByText(/map child: dark/)).toBeInTheDocument();
  });

  it('follows_the_system_scheme_when_the_theme_is_system', () => {
    document.documentElement.setAttribute('data-theme', 'system');
    renderMapView();
    const map = latestMap();
    act(() => map.load());

    act(() => media.set('(prefers-color-scheme: dark)', true));

    expect(map.styleCalls.map(({ url }) => url)).toEqual([
      'https://tiles.openfreemap.org/styles/dark',
    ]);
  });

  it('removes_the_map_on_unmount', () => {
    const { container, unmount } = renderMapView();
    act(() => latestMap().load());

    unmount();

    expect(liveMaps()).toHaveLength(0);
    expect(container.querySelector('canvas, [data-map-state]')).toBeNull();
  });

  it('shows_an_alert_when_webgl2_is_missing', () => {
    failNextMap(new GPUInitializationError('WebGL2 is required'));

    const { container } = render(
      <TestIntlProvider locale="pt-BR">
        <MapView initialView={LISBON}>
          <MapProbe />
        </MapView>
      </TestIntlProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não é possível mostrar o mapa neste navegador. Todos os lugares continuam na lista.',
    );
    expect(root(container)).toHaveAttribute('data-map-state', 'failed');
    expect(screen.queryByText(/map child/)).not.toBeInTheDocument();
  });

  it('does_not_expose_the_map_on_window_outside_e2e_builds', () => {
    renderMapView();
    act(() => latestMap().load());

    expect(window.__heremitaMap).toBeUndefined();
  });
});
