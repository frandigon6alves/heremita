import { AJAXError, type Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { keepOurLayers } from './basemap';
import { attachBasemap } from './basemap-controller';
import { Map as FakeMap } from './testing/fake-maplibre';

const POSITRON = 'https://tiles.openfreemap.org/styles/positron';
const DARK = 'https://tiles.openfreemap.org/styles/dark';
const VERSATILES_LIGHT = 'https://tiles.versatiles.org/assets/styles/colorful/style.json';
const VERSATILES_DARK = 'https://tiles.versatiles.org/assets/styles/eclipse/style.json';

function setup() {
  const fake = new FakeMap({ container: document.createElement('div') });
  const onChange = vi.fn();
  const controller = attachBasemap(
    fake as unknown as MapLibreMap,
    { theme: 'light', language: 'pt' },
    onChange,
  );
  return { fake, onChange, controller };
}

const styleError = (url: string) => ({ error: new AJAXError(404, 'Not Found', url, new Blob()) });

describe('attachBasemap', () => {
  it('reports_the_basemap_once_the_map_has_loaded', () => {
    const { fake, onChange } = setup();
    expect(onChange).not.toHaveBeenCalled();

    fake.load();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      theme: 'light',
      fonts: ['Noto Sans Bold'],
      styleRevision: 0,
    });
  });

  it('switches_theme_with_a_diffing_style_swap_that_keeps_our_layers', () => {
    const { fake, onChange, controller } = setup();
    fake.load();

    controller.show('dark', 'pt');

    expect(fake.styleCalls).toHaveLength(1);
    expect(fake.styleCalls[0]?.url).toBe(DARK);
    expect(fake.styleCalls[0]?.options).not.toHaveProperty('diff');
    expect(fake.styleCalls[0]?.options?.transformStyle).toEqual(expect.any(Function));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('counts_every_later_style_load_so_children_can_reapply_state', () => {
    const { fake, onChange, controller } = setup();
    fake.load();
    controller.show('dark', 'pt');

    fake.fire('style.load');

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ styleRevision: 1 }));
  });

  it('reloads_the_same_style_to_switch_label_language', () => {
    const { fake, controller } = setup();
    fake.load();

    controller.show('light', 'en');

    expect(fake.styleCalls.map(({ url }) => url)).toEqual([POSITRON]);
  });

  it('does_nothing_when_theme_and_language_are_unchanged', () => {
    const { fake, controller } = setup();
    fake.load();

    controller.show('light', 'pt');

    expect(fake.styleCalls).toEqual([]);
  });

  it('falls_back_to_versatiles_when_the_first_style_cannot_be_fetched', () => {
    const { fake, onChange } = setup();

    fake.fire('error', styleError(POSITRON));
    fake.load();

    expect(fake.styleCalls).toEqual([
      { url: VERSATILES_LIGHT, options: { diff: false, transformStyle: undefined } },
    ]);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ fonts: ['noto_sans_bold'] }),
    );
  });

  it('falls_back_keeping_our_layers_when_a_later_switch_fails', () => {
    const { fake, controller } = setup();
    fake.load();
    controller.show('dark', 'pt');

    fake.fire('error', styleError(DARK));

    expect(fake.styleCalls.at(-1)).toEqual({
      url: VERSATILES_DARK,
      options: { transformStyle: keepOurLayers },
    });
  });

  it('falls_back_only_once', () => {
    const { fake } = setup();

    fake.fire('error', styleError(POSITRON));
    fake.fire('error', styleError(VERSATILES_LIGHT));

    expect(fake.styleCalls).toHaveLength(1);
  });

  it('stays_on_the_fallback_for_later_theme_switches', () => {
    const { fake, controller } = setup();
    fake.fire('error', styleError(POSITRON));
    fake.load();

    controller.show('dark', 'pt');

    expect(fake.styleCalls.at(-1)).toEqual({
      url: VERSATILES_DARK,
      options: { transformStyle: keepOurLayers },
    });
  });

  it('ignores_tile_errors', () => {
    const { fake } = setup();

    fake.fire('error', styleError('https://tiles.openfreemap.org/planet/1/2/3.pbf'));

    expect(fake.styleCalls).toEqual([]);
  });

  it('reports_no_fonts_when_the_style_has_no_glyphs', () => {
    const { fake, onChange } = setup();
    fake.glyphs = undefined;

    fake.load();

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fonts: null }));
  });
});
