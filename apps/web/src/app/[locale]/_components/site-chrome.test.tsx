import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteChrome } from './site-chrome';

describe('SiteChrome', () => {
  it('frames_every_page_with_the_header_and_footer_in_hideable_wrappers', () => {
    render(
      <SiteChrome header={<header>Site header</header>} footer={<footer>Site footer</footer>}>
        <main>Page</main>
      </SiteChrome>,
    );

    const header = screen.getByText('Site header');
    const footer = screen.getByText('Site footer');
    expect(header.parentElement?.className).toBe(footer.parentElement?.className);
    expect(header.parentElement?.className).not.toBe('');
    expect(screen.getByText('Page').parentElement).not.toBe(header.parentElement);
  });

  it('hides_the_chrome_only_while_a_trip_screen_is_on_the_page', () => {
    // jsdom does not evaluate :has(): the rule itself is the contract.
    const css = readFileSync(path.join(import.meta.dirname, 'site-chrome.module.css'), 'utf8');

    expect(css).toMatch(/:root:has\(\[data-trip-screen\]\)\s+\.chrome\s*\{\s*display:\s*none;/);
  });
});
