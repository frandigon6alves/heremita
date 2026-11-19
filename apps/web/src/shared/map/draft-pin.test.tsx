import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { DraftPin } from './draft-pin';
import { latestMarker, resetFakeMaps } from './testing/fake-maplibre';
import { defineTokens, renderInMap, setPageTheme } from './testing/render-map';

vi.mock('maplibre-gl', () => import('./testing/fake-maplibre'));

const EN_LABEL =
  'New pin. Move it with the arrow keys (Shift moves further), press Enter to choose this spot.';

let removeTokens: () => void;

beforeEach(() => {
  installFakeMatchMedia();
  removeTokens = defineTokens({ '--color-accent': '#b8432a' }, { '--color-accent': '#f0896b' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  removeTokens();
  resetFakeMaps();
  document.documentElement.removeAttribute('data-theme');
});

function renderPin(
  props: Partial<Parameters<typeof DraftPin>[0]> = {},
  locale: 'en' | 'pt-BR' = 'en',
) {
  const handlers = { onMove: vi.fn(), onActivate: vi.fn() };
  const view = renderInMap(<DraftPin lngLat={[-9.14, 38.71]} {...handlers} {...props} />, {
    locale,
  });
  return { ...view, ...handlers };
}

describe('DraftPin', () => {
  it('appears_as_a_named_draggable_button_in_the_accent_colour', async () => {
    const { map } = renderPin();

    const pin = await screen.findByRole('button', { name: EN_LABEL });

    expect(map.getCanvasContainer()).toContainElement(pin);
    expect(latestMarker().options).toEqual({ color: '#b8432a', draggable: true });
  });

  it('is_named_in_portuguese', async () => {
    renderPin({}, 'pt-BR');

    expect(
      await screen.findByRole('button', {
        name: 'Novo marcador. Mova com as setas (Shift move mais longe), pressione Enter para escolher este ponto.',
      }),
    ).toBeInTheDocument();
  });

  it('takes_focus_when_asked_for_the_keyboard_path', async () => {
    renderPin({ autoFocus: true });

    expect(await screen.findByRole('button', { name: EN_LABEL })).toHaveFocus();
  });

  it('leaves_focus_alone_by_default', async () => {
    renderPin();

    expect(await screen.findByRole('button', { name: EN_LABEL })).not.toHaveFocus();
  });

  it('opens_the_card_on_enter_or_space', async () => {
    const user = userEvent.setup();
    const { onActivate } = renderPin({ autoFocus: true });
    await screen.findByRole('button', { name: EN_LABEL });

    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('reports_where_it_was_dragged_to', async () => {
    const { onMove } = renderPin();
    await screen.findByRole('button', { name: EN_LABEL });
    const marker = latestMarker();

    act(() => {
      marker.setLngLat([-9.2, 38.7]);
      marker.fire('dragend');
    });

    expect(onMove).toHaveBeenCalledExactlyOnceWith([-9.2, 38.7]);
  });

  it('follows_its_lng_lat_prop', async () => {
    const { rerender } = renderPin();
    await screen.findByRole('button', { name: EN_LABEL });

    rerender(<DraftPin lngLat={[-9.15, 38.72]} onMove={vi.fn()} onActivate={vi.fn()} />);

    expect(latestMarker().getLngLat()).toEqual({ lng: -9.15, lat: 38.72 });
  });

  it('keeps_focus_when_rebuilt_for_a_theme_change', async () => {
    renderPin({ autoFocus: true });
    await screen.findByRole('button', { name: EN_LABEL });
    const lightMarker = latestMarker();

    await setPageTheme('dark');

    const pin = await screen.findByRole('button', { name: EN_LABEL });
    expect(latestMarker()).not.toBe(lightMarker);
    expect(latestMarker().options).toMatchObject({ color: '#f0896b', draggable: true });
    expect(pin).toHaveFocus();
  });

  it('disappears_when_unmounted', async () => {
    const { unmount } = renderPin();
    await screen.findByRole('button', { name: EN_LABEL });

    unmount();

    expect(screen.queryByRole('button', { name: EN_LABEL })).not.toBeInTheDocument();
  });
});
