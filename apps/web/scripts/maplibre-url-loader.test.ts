import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import maplibreUrlLoader from './maplibre-url-loader.mjs';

const require = createRequire(import.meta.url);
const maplibre = readFileSync(
  require.resolve('maplibre-gl/dist/maplibre-gl.mjs', { paths: [import.meta.dirname] }),
  'utf8',
);

describe('maplibreUrlLoader', () => {
  it('leaves_no_new_URL_for_the_bundler_to_read_as_an_asset_pattern', () => {
    expect(maplibre).toContain('new URL(');

    expect(maplibreUrlLoader(maplibre)).not.toContain('new URL(');
  });

  it('keeps_every_other_character_of_the_bundle', () => {
    expect(maplibreUrlLoader(maplibre).replaceAll('new globalThis.URL(', 'new URL(')).toBe(
      maplibre,
    );
  });
});
