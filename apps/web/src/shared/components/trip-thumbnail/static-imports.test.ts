import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(import.meta.dirname, '../../..');
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
/** Static imports only: a dynamic `import()` is the point of the thumbnail. */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)[^'";]*?\s+from\s+['"]([^'"]+)['"]/gm;

function resolve(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (base === null) {
    return null;
  }
  if (existsSync(base) && statSync(base).isFile()) {
    return base;
  }
  return EXTENSIONS.map((extension) => base + extension).find((file) => existsSync(file)) ?? null;
}

/** Package names the static import graph of `entry` reaches. */
function packagesReached(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    for (const [, specifier = ''] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      const target = resolve(file, specifier);
      if (target === null) {
        packages.add(specifier);
      } else {
        visit(target);
      }
    }
  };
  visit(entry);
  return packages;
}

describe('TripThumbnail', () => {
  it('never_imports_maplibre_statically_so_cards_stay_off_the_map_chunk', () => {
    const reached = packagesReached(path.join(import.meta.dirname, 'trip-thumbnail.tsx'));

    expect([...reached].filter((name) => name.startsWith('maplibre-gl'))).toEqual([]);
    expect(reached.has('react')).toBe(true);
  });
});
