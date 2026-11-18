import { expect, test, type Page } from '@playwright/test';

async function waitHydrated(page: Page): Promise<void> {
  await expect(page.locator('[data-hydrated="true"]')).toHaveCount(1);
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('root redirects by Accept-Language (en-US browser) to /en', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
});

test.describe('pt-BR browser', () => {
  test.use({ locale: 'pt-BR' });
  test('root redirects to /pt-BR', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/pt-BR$/);
  });
});

test.describe('unsupported browser language', () => {
  test.use({ locale: 'de-DE' });
  test('root falls back to default /pt-BR', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/pt-BR$/);
  });
});

test('public place and app review routes coexist under one [locale] root', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/en/places/abc');
  await expect(page.getByRole('heading', { name: 'public place abc' })).toBeVisible();
  await expect(page.getByTestId('hello')).toHaveText('Hello');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('link', { name: 'review' }).click();
  await expect(page).toHaveURL(/\/en\/places\/abc\/review$/);
  await expect(page.getByRole('heading', { name: 'review abc in en' })).toBeVisible();
  await expect(page.getByTestId('app-gate')).toBeVisible();
  await page.goto('/pt-BR/places/abc');
  await expect(page.getByTestId('hello')).toHaveText('Olá');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  expect(errors).toEqual([]);
});

test('unknown locale is a 404', async ({ page }) => {
  const res = await page.goto('/xx/places/abc');
  expect(res?.status()).toBe(404);
});

test('nuqs: push for place, replace for day and mode; next-intl client plural =0', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/pt-BR/params');
  await waitHydrated(page);
  await expect(page.getByTestId('plural')).toHaveText('Nenhum lugar');
  await page.getByRole('button', { name: 'day' }).click();
  await page.getByRole('button', { name: 'mode' }).click();
  await expect(page).toHaveURL(/day=d2/);
  await expect(page).toHaveURL(/mode=bike/);
  await page.getByRole('button', { name: 'place' }).click();
  await expect(page.getByTestId('state')).toHaveText('day=d2 place=p1 mode=bike');
  // nuqs flushes the URL asynchronously (throttled): wait for the push before Back.
  await expect(page).toHaveURL(/place=p1/);
  expect(await page.evaluate(() => history.length)).toBe(3);
  await page.goBack();
  await expect(page.getByTestId('state')).toHaveText('day=d2 place=- mode=bike');
  expect(errors).toEqual([]);
});

test('dnd-kit sortable: keyboard reorder under StrictMode', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/en/dnd');
  await waitHydrated(page);
  await page.getByRole('button', { name: 'Drag A' }).focus();
  const live = page.locator('[id^="DndLiveRegion"]');
  let lostKeys = 0;
  // The sensor listens for keys one task after pick-up and measures droppables
  // in an effect, so a key pressed in the same few ms is dropped: retry until announced.
  async function step(key: string, announced: RegExp): Promise<void> {
    await expect(async () => {
      await page.keyboard.press(key);
      try {
        await expect(live).toHaveText(announced, { timeout: 250 });
      } catch (error) {
        lostKeys += 1;
        throw error;
      }
    }).toPass({ timeout: 5000 });
  }
  await page.keyboard.press('Space');
  await step('ArrowDown', /over droppable area B/);
  await step('ArrowDown', /over droppable area C/);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('order')).toHaveText('B,C,A,D');
  console.log(`keyboard lost keys: ${lostKeys}`);
  await expect(live).toHaveText(/dropped over droppable area C/);
  await expect(page.getByTestId('ends')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Drag A' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('dnd-kit sortable: mouse drag under StrictMode', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'mouse only on desktop');
  const errors = trackErrors(page);
  await page.goto('/en/dnd');
  await waitHydrated(page);
  const a = await page.getByRole('button', { name: 'Drag A' }).boundingBox();
  const c = await page.getByTestId('row-C').boundingBox();
  if (!a || !c) throw new Error('no boxes');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + ((c.y + c.height / 2 - (a.y + a.height / 2)) * i) / 10);
  }
  await page.mouse.up();
  await expect(page.getByTestId('order')).toHaveText('B,C,A,D');
  expect(errors).toEqual([]);
});

test('dnd-kit sortable: touch long-press drag under StrictMode', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'touch only on mobile');
  const errors = trackErrors(page);
  await page.clock.install();
  await page.goto('/en/dnd');
  await waitHydrated(page);
  const a = await page.getByRole('button', { name: 'Drag A' }).boundingBox();
  const c = await page.getByTestId('row-C').boundingBox();
  if (!a || !c) throw new Error('no boxes');
  const cdp = await page.context().newCDPSession(page);
  const x = a.x + a.width / 2;
  const y0 = a.y + a.height / 2;
  const y1 = c.y + c.height / 2 + 10;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  await touch('touchStart', y0);
  await page.clock.runFor(300);
  for (let i = 1; i <= 10; i++) await touch('touchMove', y0 + ((y1 - y0) * i) / 10);
  await touch('touchEnd', y1);
  await expect(page.getByTestId('order')).toHaveText('B,C,A,D');
  expect(errors).toEqual([]);
});

test('dnd-kit sortable: quick touch swipe does not start a drag', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'touch only on mobile');
  await page.clock.install();
  await page.goto('/en/dnd');
  await waitHydrated(page);
  const a = await page.getByRole('button', { name: 'Drag A' }).boundingBox();
  if (!a) throw new Error('no box');
  const cdp = await page.context().newCDPSession(page);
  const x = a.x + a.width / 2;
  const y0 = a.y + a.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + 120 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('order')).toHaveText('A,B,C,D');
  await expect(page.getByTestId('ends')).toHaveText('0');
});

test('downshift useCombobox: type, arrow, enter under StrictMode', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/en/combobox');
  await waitHydrated(page);
  const input = page.getByRole('combobox', { name: 'Search places' });
  await input.fill('Lis');
  await expect(page.getByRole('option')).toHaveCount(2);
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /.+/);
  await input.press('Enter');
  await expect(page.getByTestId('picked')).toHaveText('Lisbon Oceanarium');
  await expect(input).toHaveValue('Lisbon Oceanarium');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.fill('P');
  await page.getByRole('option', { name: 'Porto' }).click();
  await expect(page.getByTestId('picked')).toHaveText('Porto');
  expect(errors).toEqual([]);
});

test('StrictMode double-mounts effects in dev only', async ({ page }) => {
  await page.goto('/en/dnd');
  await waitHydrated(page);
  expect(await page.evaluate(() => window.spikeMounts)).toBe(process.env.SPIKE_DEV ? 2 : 1);
});
