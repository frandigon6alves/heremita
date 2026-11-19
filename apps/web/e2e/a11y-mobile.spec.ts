import { endpoints } from '@heremita/shared';
import type { Page } from '@playwright/test';
import { arrangeTrip, PLACES, type Account } from './support/api';
import { accountTest as test, expect } from './support/fixtures';
import { expectMapReady, openRowMenu, stopList } from './support/planner';

/** Widths the layout must hold without sideways scrolling (V64), split by device class. */
const PHONE_WIDTHS = [360, 768] as const;
const DESKTOP_WIDTHS = [1024, 1280] as const;
const PHONE_WIDTH = 360;

const DAY_ONE = [PLACES.torreDeBelem, PLACES.mosteiroDosJeronimos, PLACES.padraoDosDescobrimentos];
/** Enough days that the chip row must scroll inside the sheet. */
const DAY_COUNT = 12;

interface Sitemap {
  tripId: string;
  dayOneId: string;
  urls: string[];
}

/**
 * Every page of the app with real content: a trip with a full first day, an idea
 * and many days, shared by link, plus a seeded place and the account's profile.
 */
async function arrangeSitemap(account: Account): Promise<Sitemap> {
  const trip = await arrangeTrip(account.api, {
    title: 'Belém on a sunny day, with a title long enough to wrap the line',
    days: [DAY_ONE, ...Array.from({ length: DAY_COUNT - 1 }, () => [])],
    ideas: [PLACES.lxFactory],
  });
  const { shareToken } = await account.api.call(endpoints.updateTrip, {
    params: { tripId: trip.id },
    body: { visibility: 'link' },
  });
  const { items } = await account.api.call(endpoints.searchPlaces, {
    query: { q: 'Sainte-Chapelle', locale: 'en' },
  });
  const placeId = items.find((item) => item.name === 'Sainte-Chapelle')?.placeId ?? '';
  const dayOneId = trip.plan.days[0]?.id ?? '';
  return {
    tripId: trip.id,
    dayOneId,
    urls: [
      '/en',
      '/es',
      '/pt-BR',
      '/en/explore',
      '/en/about',
      '/en/privacy',
      `/en/places/${placeId}`,
      `/en/places/${placeId}/review`,
      `/en/u/${account.me.id}`,
      `/en/s/${shareToken}`,
      '/en/trips',
      '/en/trips/new',
      `/en/trips/${trip.id}`,
      `/en/trips/${trip.id}?day=ideas`,
      `/en/trips/${trip.id}?day=${dayOneId}`,
      `/en/trips/${trip.id}/settings`,
      '/en/settings',
      '/en/does-not-exist',
    ],
  };
}

/** Opens a page and waits until it has rendered its heading (and its map, if any). */
async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('h1')).toBeVisible();
  const map = page.locator('[data-map-state]');
  if ((await map.count()) > 0) {
    await expectMapReady(page);
  }
}

test('no_page_scrolls_sideways_at_any_width', async ({ page, account, isMobile }) => {
  // Every page at every width: about 30 s on a CI runner, the default timeout.
  test.slow();
  const { urls } = await arrangeSitemap(account);
  const overflowing: string[] = [];

  for (const width of isMobile ? PHONE_WIDTHS : DESKTOP_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const url of urls) {
      await visit(page, url);
      const scrollWidth = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      );
      if (scrollWidth > width) {
        overflowing.push(`${width} px ${url}: ${scrollWidth} px wide`);
      }
    }
  }

  expect(overflowing, 'pages wider than the viewport (V64)').toEqual([]);
});

/**
 * Problems a phone user meets on the current screen (V56, V61): controls smaller
 * than 44 × 44 px or hidden under another element, inputs under 16 px (iOS zooms),
 * icons squeezed below their size, more than one h1 or a skipped heading level.
 */
function auditPhoneScreen(): string[] {
  const TARGET = 44;
  const problems: string[] = [];
  const describe = (element: Element) =>
    `${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}"`;

  /** Painted, and not clipped by the viewport or a scrolling ancestor. */
  const fullyShown = (element: Element): boolean => {
    if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: false })) {
      return false;
    }
    if (element.closest('[inert], [aria-hidden="true"]')) {
      return false;
    }
    const box = element.getBoundingClientRect();
    if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) {
      return false;
    }
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(parent);
      if (overflowX === 'visible' && overflowY === 'visible') {
        continue;
      }
      const clip = parent.getBoundingClientRect();
      if (
        box.top < clip.top ||
        box.left < clip.left ||
        box.bottom > clip.bottom ||
        box.right > clip.right
      ) {
        return false;
      }
    }
    return true;
  };

  // An open menu or dialog covers the page on purpose: only its own controls count then.
  const layer = document.querySelector('dialog[open], [popover]:popover-open') ?? document;
  const controls = layer.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]',
  );
  for (const control of controls) {
    const style = getComputedStyle(control);
    // Links inside running text are exempt (WCAG 2.5.8 inline exception).
    const inlineLink = control.tagName === 'A' && style.display === 'inline';
    // A radio or checkbox is hit through its label.
    const choice = control.matches('input[type="radio"], input[type="checkbox"]');
    const target = choice ? (control.closest('label') ?? control) : control;
    if (inlineLink || !fullyShown(target)) {
      continue;
    }
    const box = target.getBoundingClientRect();
    if (box.width < TARGET - 0.5 || box.height < TARGET - 0.5) {
      problems.push(
        `${describe(control)} is ${Math.round(box.width)} × ${Math.round(box.height)} px`,
      );
    }
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (hit === null || !(target.contains(hit) || hit.contains(target))) {
      problems.push(`${describe(control)} is covered by ${hit ? describe(hit) : 'nothing'}`);
    }
    if (
      control.matches('input:not([type="radio"]):not([type="checkbox"]), select, textarea') &&
      Number.parseFloat(style.fontSize) < 16
    ) {
      problems.push(`${describe(control)} has a ${style.fontSize} font`);
    }
  }

  for (const icon of document.querySelectorAll('svg[aria-hidden="true"][width]')) {
    const size = Number(icon.getAttribute('width'));
    const { width } = icon.getBoundingClientRect();
    if (fullyShown(icon) && Math.abs(width - size) > 0.5) {
      problems.push(`icon in ${describe(icon.parentElement ?? icon)} is ${width} px, not ${size}`);
    }
  }

  // Visually hidden headings still count: only unrendered ones (closed dialogs) do not.
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((heading) =>
    heading.checkVisibility(),
  );
  const h1Count = headings.filter((heading) => heading.tagName === 'H1').length;
  if (h1Count !== 1) {
    problems.push(`${h1Count} h1 elements`);
  }
  headings.reduce((previous, heading) => {
    const level = Number(heading.tagName.slice(1));
    if (level > previous + 1) {
      problems.push(`${describe(heading)} skips from h${previous} to h${level}`);
    }
    return level;
  }, 0);

  return problems;
}

test('phone_targets_are_44_px_uncovered_and_headings_nest', async ({ page, account, isMobile }) => {
  test.skip(!isMobile, 'Touch targets are a phone check.');
  const { tripId, dayOneId, urls } = await arrangeSitemap(account);
  await page.setViewportSize({ width: PHONE_WIDTH, height: 780 });
  const problems: string[] = [];

  for (const url of urls) {
    await visit(page, url);
    problems.push(
      ...(await page.evaluate(auditPhoneScreen)).map((problem) => `${url}: ${problem}`),
    );
  }
  // The row menu floats over the list and the sheet.
  await visit(page, `/en/trips/${tripId}?day=${dayOneId}`);
  await openRowMenu(page, 'Torre de Belém');
  problems.push(
    ...(await page.evaluate(auditPhoneScreen)).map((problem) => `row menu: ${problem}`),
  );

  expect(problems, 'phone target, font, icon or heading problems (V56, V61)').toEqual([]);
});

test('the_collapsed_sheet_shows_its_handle_chips_and_day_summary', async ({
  page,
  account,
  isMobile,
}) => {
  test.skip(!isMobile, 'The sheet is the phone layout; desktop has a side panel.');
  // A trip with nothing on its days opens at peek.
  const trip = await arrangeTrip(account.api, {
    title: 'Only ideas',
    days: [[], []],
    ideas: [PLACES.lxFactory],
  });
  await page.setViewportSize({ width: PHONE_WIDTH, height: 780 });
  await visit(page, `/en/trips/${trip.id}`);

  const sheet = page.locator('[data-snap="peek"]');
  const sheetTop = (await sheet.boundingBox())?.y ?? 0;
  const summaryBox = await page.getByText('Ideas · 1 place').boundingBox();
  expect(summaryBox?.y ?? 0).toBeGreaterThan(sheetTop);
  expect((summaryBox?.y ?? 0) + (summaryBox?.height ?? 0)).toBeLessThanOrEqual(780);
  await expect(page.getByRole('button', { name: /^Panel: collapsed/ })).toBeInViewport();
  await expect(page.getByRole('group', { name: 'Days' })).toBeInViewport({ ratio: 1 });
});

/** The accessible name a screen reader would read for the focused element, roughly. */
function focusedName(): string {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) {
    return '';
  }
  const labelled = focused.getAttribute('aria-labelledby');
  const name =
    focused.getAttribute('aria-label') ??
    (labelled ? document.getElementById(labelled)?.textContent : null) ??
    (focused instanceof HTMLInputElement ? focused.labels?.[0]?.textContent : null) ??
    focused.textContent ??
    '';
  return name.trim().replace(/\s+/g, ' ');
}

/** Whether the focused element (or the label painting it) shows the 3 px focus ring. */
function focusRingShown(): boolean {
  for (
    let element: Element | null = document.activeElement, depth = 0;
    element && depth < 3;
    element = element.parentElement, depth += 1
  ) {
    const { outlineStyle, outlineWidth } = getComputedStyle(element);
    if (outlineStyle !== 'none' && Number.parseFloat(outlineWidth) >= 3) {
      return true;
    }
  }
  return false;
}

test('the_keyboard_walks_the_planner_in_reading_order_with_a_visible_ring', async ({
  page,
  account,
}) => {
  const trip = await arrangeTrip(account.api, { title: 'Focus order', days: [DAY_ONE] });
  await visit(page, `/en/trips/${trip.id}`);

  const visited: string[] = [];
  const unringed: string[] = [];
  const LAST = 'Add here';
  for (let presses = 0; presses < 60 && visited.at(-1) !== LAST; presses += 1) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(focusedName);
    visited.push(name);
    if (!(await page.evaluate(focusRingShown))) {
      unringed.push(name);
    }
  }

  // §I.web.screens DOM order: app bar → search → skip link → sheet/panel → map → floating buttons.
  const landmarks = [
    'My trips',
    'Search places',
    'Skip to the map',
    'Day 1',
    'Actions for Torre de Belém',
    'Actions for Padrão dos Descobrimentos',
    'Map of Focus order',
    LAST,
  ];
  const positions = landmarks.map((landmark) => visited.indexOf(landmark));
  expect(positions, `focus order: ${visited.join(' → ')}`).not.toContain(-1);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(unringed, 'focus stops without a visible ring').toEqual([]);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing_on_the_planner_moves', async ({ page, account }) => {
    const trip = await arrangeTrip(account.api, { title: 'No motion', days: [DAY_ONE] });
    await visit(page, `/en/trips/${trip.id}`);
    await openRowMenu(page, 'Mosteiro dos Jerónimos');

    const moving = await page.evaluate(() => {
      const found: string[] = [];
      for (const element of document.querySelectorAll('*')) {
        const style = getComputedStyle(element);
        const properties = style.transitionProperty.split(',').map((name) => name.trim());
        style.transitionDuration.split(',').forEach((duration, index) => {
          const property = properties[index % properties.length];
          // Opacity fades stay (§I.tokens motion).
          if (Number.parseFloat(duration) > 0 && property !== 'opacity') {
            found.push(`${element.tagName} ${String(element.className)} transitions ${property}`);
          }
        });
        if (style.animationName !== 'none' && Number.parseFloat(style.animationDuration) > 0) {
          found.push(`${element.tagName} ${String(element.className)} runs ${style.animationName}`);
        }
      }
      return found;
    });

    expect(moving, 'motion left under prefers-reduced-motion (V59)').toEqual([]);
  });
});

test('a_screen_reader_hears_each_stop_its_actions_and_the_leg_to_the_next', async ({
  page,
  account,
}) => {
  const trip = await arrangeTrip(account.api, { title: 'Read aloud', days: [DAY_ONE] });
  await visit(page, `/en/trips/${trip.id}`);

  await expect(stopList(page, 1)).toMatchAriaSnapshot(`
    - list "Places of day 1":
      - listitem:
        - button /^Torre de Belém Sight/
        - button "Actions for Torre de Belém"
        - button "Move Torre de Belém"
        - 'button /^Route to Mosteiro dos Jerónimos on foot: \\d+ min · [\\d.]+ k?m$/'
      - listitem:
        - button /^Mosteiro dos Jerónimos Sight/
        - button "Actions for Mosteiro dos Jerónimos"
        - button "Move Mosteiro dos Jerónimos"
        - 'button /^Route to Padrão dos Descobrimentos on foot: \\d+ min · [\\d.]+ k?m$/'
      - listitem:
        - button /^Padrão dos Descobrimentos /
        - button "Actions for Padrão dos Descobrimentos"
        - button "Move Padrão dos Descobrimentos"
  `);
});
