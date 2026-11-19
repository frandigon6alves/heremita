import type { Locale } from '@heremita/shared';
import { act, render } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { TestIntlProvider } from '@/test-utils/render';
import { MapView } from '../map-view';
import { latestMap, type Map as FakeMap } from './fake-maplibre';

/**
 * Renders `children` inside a loaded `MapView` under Strict Mode. The test
 * file must mock `maplibre-gl` with `./fake-maplibre`. Returns the live fake
 * map and `rerender` for new children.
 */
export function renderInMap(children: ReactNode, { locale = 'en' }: { locale?: Locale } = {}) {
  const tree = (content: ReactNode) => (
    <StrictMode>
      <TestIntlProvider locale={locale}>
        <MapView initialView={{ center: [-9.14, 38.71], zoom: 12 }}>{content}</MapView>
      </TestIntlProvider>
    </StrictMode>
  );
  const result = render(tree(children));
  const map: FakeMap = latestMap();
  act(() => map.load());
  return {
    ...result,
    map,
    rerender: (content: ReactNode) => result.rerender(tree(content)),
  };
}

const declarations = (tokens: Record<string, string>) =>
  Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');

/** Defines design tokens the way `tokens.css` does: on `:root`, overridden by `[data-theme="dark"]`. */
export function defineTokens(
  light: Record<string, string>,
  dark: Record<string, string> = {},
): () => void {
  const style = document.createElement('style');
  style.textContent = `:root { ${declarations(light)} } :root[data-theme="dark"] { ${declarations(dark)} }`;
  document.head.appendChild(style);
  return () => style.remove();
}

/**
 * Sets `<html data-theme>` the way the theme switcher does. The map watches
 * the attribute with a MutationObserver, whose callback is a microtask.
 */
export async function setPageTheme(theme: string): Promise<void> {
  await act(async () => {
    document.documentElement.setAttribute('data-theme', theme);
    await Promise.resolve();
  });
}
